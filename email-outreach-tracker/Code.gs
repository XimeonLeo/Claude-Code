/**
 * EMAIL OUTREACH TRACKER (Google Sheets + Apps Script)
 * ---------------------------------------------------
 * One master Google Sheet that:
 *   - builds its own tabs (Dashboard, Leads, Inboxes, Settings, Log, ...)
 *   - imports leads from a CSV file (skips duplicates),
 *     including each lead's own personalised message and follow-ups
 *   - spreads leads across many Gmail accounts
 *   - sends each lead's own message + follow-ups from its Gmail, on a schedule
 *   - detects replies, bounces, auto-replies and "remove me" requests
 *   - logs every single action so everything can be tracked
 *
 * Setup steps are in SETUP.md. Short version:
 *   1. Paste this file into Extensions -> Apps Script of a blank Google Sheet.
 *   2. Add the "Gmail API" service (Services + -> Gmail API -> Add).
 *   3. Reload the sheet, click Outreach -> 1. Set up this sheet.
 *   4. Owner: Outreach -> Connect THIS Gmail. Every other Gmail: its own copy
 *      of this script with MASTER_SHEET and SENDER_NAME filled in, then run
 *      connectInbox (SETUP.md, Part 2).
 *   5. Leads: LEAD-PROMPT.txt, then Outreach -> Upload a lead file (CSV).
 */

// ---------------------------------------------------------------- per-Gmail copy settings
// Leave these empty in the master sheet's own script.
// In each sending Gmail's OWN copy of this script (see SETUP.md, Part 2),
// paste the master sheet's link or ID and that Gmail's sender name.
var MASTER_SHEET = '';   // e.g. 'https://docs.google.com/spreadsheets/d/1AbC.../edit'
var SENDER_NAME = '';    // e.g. 'Sarah Jones'

// When this code runs through Loader.gs (automatic updates), the loader's settings are used.
if (typeof OUTREACH_CONFIG === 'object' && OUTREACH_CONFIG) {
  if (OUTREACH_CONFIG.MASTER_SHEET) MASTER_SHEET = OUTREACH_CONFIG.MASTER_SHEET;
  if (OUTREACH_CONFIG.SENDER_NAME) SENDER_NAME = OUTREACH_CONFIG.SENDER_NAME;
}

// Change both every time you publish a new version, and add what changed to CHANGELOG (further down).
// People see the version in Outreach -> Which Gmail am I using?, and the changes in Outreach -> What's new.
var CORE_BUILD = 37;
var CORE_VERSION = 'v37';

// Daily limits: anything from 1 up to Gmail's own cap. Above SAFE_LIMIT a free Gmail is more likely to be
// flagged, so the sheet warns but allows it.
var MAX_LIMIT = 500;
var SAFE_LIMIT = 35;

// ---------------------------------------------------------------- admins
// Only these Gmails can use "Outreach -> Admin: watch team sheets".
// Fill this in BEFORE you give Code.gs to your team. Separate several with commas.
var ADMINS = 'simeono.automation@gmail.com'; // add more with commas, e.g. 'you@gmail.com, partner@gmail.com'

// ---------------------------------------------------------------- constants

var SHEET = {
  DASH: 'Dashboard',
  SETTINGS: 'Settings',
  INBOXES: 'Inboxes',
  LEADS: 'Leads',
  LOG: 'Log',
  IMPORT: 'Import',
  DNC: 'Do Not Contact'
};

var STATUS = {
  NEW: 'New',
  ACTIVE: 'In sequence',
  DONE: 'Completed',
  REPLIED: 'Replied',
  BOUNCED: 'Bounced',
  UNSUB: 'Unsubscribed',
  SKIPPED: 'Do not contact',
  NEEDS: 'Needs message',
  FAILED: 'Send failed'
};
var STATUS_LIST = [STATUS.NEW, STATUS.NEEDS, STATUS.ACTIVE, STATUS.DONE, STATUS.REPLIED,
                   STATUS.BOUNCED, STATUS.UNSUB, STATUS.SKIPPED, STATUS.FAILED];

var PACES = ['Steady', 'Fast'];

var OUTCOMES = ['Interested', 'Meeting booked', 'Not interested',
                'Wrong person', 'Follow up later', 'Customer'];

var LEAD_HEADERS = ['Lead ID', 'Email', 'First Name', 'Last Name', 'Company',
  'Status', 'Assigned Inbox', 'Emails Sent', 'Email 1 Sent', 'Follow-up 1 Sent',
  'Follow-up 2 Sent', 'Next Send', 'Replied At', 'Reply Snippet', 'Bounced At',
  'Bounce Reason', 'Outcome', 'Notes', 'Source', 'Imported At', 'Subject',
  'Message', 'Follow-up 1 Message', 'Follow-up 2 Message', 'Variant',
  'Thread ID', 'Message IDs', 'Extra Fields'];

// The columns that hold the text to send for step 1, 2, 3.
var MESSAGE_COLS = ['Message', 'Follow-up 1 Message', 'Follow-up 2 Message'];

var SENT_COLS = ['Email 1 Sent', 'Follow-up 1 Sent', 'Follow-up 2 Sent'];
var SENT_EVENTS = ['SENT_1', 'SENT_FU1', 'SENT_FU2'];

var INBOX_HEADERS = ['Inbox Email', 'Sender Name', 'Daily Limit', 'Status',
  'Connected', 'Last Run', 'Sent Today', 'Total Sent', 'Bounces', 'Bounce %',
  'Replies', 'Reply %', 'Leads Assigned', 'Leads Waiting', 'Health', 'Notes', 'Last Result',
  'Warm-up Day 1', 'Warm-up Per Day'];
var INBOX_FORMULA_ROWS = 60;

var LOG_HEADERS = ['Timestamp', 'Inbox', 'Lead Email', 'Event', 'Lead ID',
  'Detail', 'Thread ID', 'Gmail Message ID'];

var DNC_HEADERS = ['Email or @domain', 'Reason', 'Added At'];

var SETTINGS_DEF = [
  { key: 'name', label: 'Campaign name', value: 'Outreach Campaign', note: 'Shown on the Dashboard.' },
  { key: 'goal', label: 'Goal (delivered messages)', value: 5000, note: 'Delivered = sent minus bounced. Counts first emails and follow-ups.' },
  { key: 'start', label: 'Campaign start date', value: 'TODAY', note: 'Day 1 of the campaign.' },
  { key: 'length', label: 'Campaign length (days)', value: 11, note: '' },
  { key: 'dailyLimit', label: 'Default daily limit per inbox', value: 35, note: 'Max emails (first + follow-ups) per Gmail per day, 1 to 500. To give one Gmail its own limit, type it in that Gmail\'s Daily Limit cell on the Inboxes tab. Free Gmail: 35 or less is safest.' },
  { key: 'rampStart', label: 'Warm-up: day 1 limit', value: 20, note: 'Inboxes start lower and climb to the daily limit. Leave blank to skip warm-up.' },
  { key: 'rampStep', label: 'Warm-up: increase per day', value: 5, note: 'e.g. 20, 25, 30, 35...' },
  { key: 'followUps', label: 'Follow-ups per lead (0-2)', value: 2, note: '' },
  { key: 'fu1Days', label: 'Days before follow-up 1', value: 3, note: 'Counted from the first email.' },
  { key: 'fu2Days', label: 'Days before follow-up 2', value: 4, note: 'Counted from follow-up 1.' },
  { key: 'startHour', label: 'Send window start hour (0-23)', value: 8, note: 'Uses the sheet time zone (File -> Settings).' },
  { key: 'endHour', label: 'Send window end hour (0-23)', value: 18, note: 'No emails at or after this hour.' },
  { key: 'weekends', label: 'Send on weekends', value: true, note: 'TRUE or FALSE.' },
  { key: 'minDelay', label: 'Min seconds between emails', value: 20, note: 'Random pause between sends looks more human.' },
  { key: 'maxDelay', label: 'Max seconds between emails', value: 60, note: '' },
  { key: 'bouncePause', label: 'Auto-pause inbox at bounce rate', value: 0.05, note: 'An inbox stops sending if bounces reach this rate. Only its last 7 days count (at least 20 sends), and only sends since it was last turned back on.' },
  { key: 'autoResume', label: 'Restart a Gmail paused for bounces after (days)', value: 2, note: 'It restarts slowly (warm-up from day 1). After 3 pauses in 14 days it stays paused until you set it to Active. Leave blank to never restart by itself.', added: true },
  { key: 'pace', label: 'Sending pace', value: 'Steady', note: 'Steady = spread across the send window (safest). Fast = each Gmail sends its daily limit as soon as it can, usually within 1 to 2 hours.', added: true },
  { key: 'autoMove', label: 'Move waiting leads off stuck Gmails', value: true, note: 'TRUE = a working Gmail takes over New leads from a Gmail that is paused, removed, or has not run for 3 hours.', added: true },
  { key: 'signature', label: 'Signature (added under every email)', value: '{{sender_name}}', note: 'Each Gmail signs with its own Sender Name. Leave blank if your messages already end with a name.' },
  { key: 'defSubject', label: 'Default subject (if a lead has none)', value: 'Quick question, {{first_name|there}}', note: 'Only used when the Subject column is empty.' },
  { key: 'defFu1', label: 'Default follow-up 1 (if a lead has none)', value: 'Hi {{first_name|there}}, just bumping this to the top of your inbox in case it got buried. Would it make sense to chat?', note: 'Only used when the lead has no Follow-up 1 Message. Leave blank to skip.' },
  { key: 'defFu2', label: 'Default follow-up 2 (if a lead has none)', value: 'Hi {{first_name|there}}, I will not keep filling your inbox, so this is my last note. If this is ever a priority, just reply and I will send details.', note: 'Only used when the lead has no Follow-up 2 Message. Leave blank to skip.' },
  { key: 'optOut', label: 'Opt-out line', value: 'P.S. Not relevant? Just reply "no" and I won\'t email you again.', note: 'Added to the end of every email. Leave blank for none.' },
  { key: 'standard', label: 'Daily standard (emails sent per day)', value: '', note: 'Used by "My last 24 hours". Leave blank to use what your active Gmails can send today (daily limits, with warm-up).', added: true },
  { key: 'paused', label: 'Pause everything', value: false, note: 'Set TRUE to stop all sending right away.' },
  { key: 'layout', label: 'Dashboard layout', value: 'Classic', note: 'Classic, Executive, Scoreboard, Funnel, Inbox Command or Compact. Outreach -> Choose dashboard layout shows a preview of each.' },
  { key: 'theme', label: 'Colour theme', value: 'Navy & Gold', note: 'Navy & Gold, Emerald & Gold, Burgundy & Gold, Notion Style or ClickUp Style. Then click Outreach -> Apply colour theme.' }
];

// ---------------------------------------------------------------- menu

function onOpen() {
  // After an update: a notice in the corner and a highlighted first menu item, until the person opens
  // What's new. (Google does not let a window open by itself when the sheet opens.)
  var fresh = seenBuild_() < CORE_BUILD;
  if (fresh) {
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast('Outreach was updated to ' + CORE_VERSION +
        '. Click 📧 Outreach → 🆕 What\'s new to see what changed and where to find it.', '🆕 Outreach updated', 30);
    } catch (e) { /* the menu item still shows it */ }
  }
  SpreadsheetApp.getUi().createMenu('📧 Outreach')
    .addItem(fresh ? '🆕 What\'s new in ' + CORE_VERSION + ' (click to see)' : 'What\'s new / changelog', 'slot9')
    .addSeparator()
    .addItem('1. Set up / repair this sheet', 'setupSheet')
    .addItem('Reset to default settings (keeps your leads)', 'slot3')
    .addSeparator()
    .addItem('Upload a lead file (CSV)', 'showUploadDialog')
    .addItem('Spread waiting leads across inboxes', 'rebalanceLeads')
    .addSeparator()
    .addItem('Connect THIS Gmail (start sending)', 'connectInbox')
    .addItem('Disconnect THIS Gmail (stop sending)', 'disconnectInbox')
    .addItem('Send a test email to myself', 'sendTestEmail')
    .addItem('Run now for THIS Gmail', 'runNow')
    .addItem('Check replies & bounces now', 'checkNow')
    .addSeparator()
    .addItem('Replies: set outcomes & follow-ups', 'slot6')
    .addItem('My last 24 hours (report)', 'slot7')
    .addSeparator()
    .addItem('Which Gmail am I using?', 'whoAmI')
    .addItem('Choose dashboard layout', 'slot4')
    .addItem('Apply colour theme', 'slot2')
    .addItem('About ' + BRAND.name, 'slot1')
    .addItem(viaLoader_() ? 'Check for updates now' : 'Version: ' + CORE_VERSION, viaLoader_() ? 'updateNow' : 'whoAmI')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Admin: watch team sheets')
      .addItem('Add a team member\'s sheet', 'addTeamSheet')
      .addItem('Check all team sheets now', 'refreshTeam')
      .addItem('Turn on automatic checks (every 2 hours)', 'teamAutoOn')
      .addItem('Turn off automatic checks', 'teamAutoOff')
      .addItem('Leaderboard: my own numbers are ' + (boardIncludesMe_() ? 'ON' : 'OFF') + ' (click to switch)', 'slot8'))
    .addToUi();
}

// ---------------------------------------------------------------- setup

// Google's Allow screen lets people untick some permissions. If any are missing, this brings
// the Allow screen back (tick "Select all") instead of failing halfway through.
function askAllPermissions_() {
  if (typeof ScriptApp !== 'undefined' && ScriptApp && typeof ScriptApp.requireAllScopes === 'function') {
    ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  }
}

function setupSheet() {
  askAllPermissions_();
  var ss = ss_();
  // Check the header rows first. If they look wrong, stop before changing anything.
  var problem = headerProblems_(ss);
  if (problem) return alert_(problem);
  PropertiesService.getScriptProperties().setProperty('SSID', ss.getId());

  // Settings
  var st = ensureSheet_(ss, SHEET.SETTINGS, ['Setting', 'Value', 'Notes']);
  var existing = st.getLastRow() > 1
    ? st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); })
    : [];
  SETTINGS_DEF.forEach(function (d) {
    if (existing.indexOf(d.label) < 0) {
      var v = d.value === 'TODAY' ? todayDate_(ss) : d.value;
      st.appendRow([d.label, v, d.note]);
    }
  });
  var sv = st.getRange(1, 1, st.getLastRow(), 1).getValues();
  for (var i = 0; i < sv.length; i++) {
    if (sv[i][0] === 'Colour theme') {
      st.getRange(i + 1, 2).setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInList(THEME_NAMES, true).setAllowInvalid(false).build());
    }
    if (sv[i][0] === 'Campaign start date') st.getRange(i + 1, 2).setNumberFormat('yyyy-mm-dd');
    if (sv[i][0] === 'Auto-pause inbox at bounce rate') st.getRange(i + 1, 2).setNumberFormat('0%');
  }
  st.setColumnWidth(1, 260); st.setColumnWidth(2, 420); st.setColumnWidth(3, 480);
  st.getRange('B:B').setWrap(true);
  st.getRange('A:A').setFontWeight('bold');
  settingsRules_(st);

  // Inboxes (formulas are written after the Leads tab exists)
  ensureSheet_(ss, SHEET.LEADS, LEAD_HEADERS);
  var ib = ensureSheet_(ss, SHEET.INBOXES, INBOX_HEADERS);
  writeInboxFormulas_(ib);
  var icm = colMap_(ib);
  ib.getRange(2, icm['Status'] + 1, INBOX_FORMULA_ROWS, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Active', 'Paused', 'Paused - bounces'], true)
      .setAllowInvalid(true).build());
  // Each Gmail's own daily limit (blank = the Settings default).
  ib.getRange(2, icm['Daily Limit'] + 1, INBOX_FORMULA_ROWS, 1).setNumberFormat('0').setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(1, MAX_LIMIT).setAllowInvalid(false)
      .setHelpText('This Gmail\'s own daily limit, 1 to ' + MAX_LIMIT + '. Leave blank to use Settings -> Default daily limit per inbox.').build());
  // Each Gmail's own warm-up (blank = the Settings warm-up).
  [['Warm-up Day 1', 'Emails on this Gmail\'s first day, 0 to ' + MAX_LIMIT + '. 0 = no warm-up for this Gmail. Blank = Settings -> Warm-up: day 1 limit.'],
   ['Warm-up Per Day', 'How many more each day, 0 to ' + MAX_LIMIT + '. Blank = Settings -> Warm-up: increase per day.']].forEach(function (w) {
    if (icm[w[0]] === undefined) return;
    ib.getRange(2, icm[w[0]] + 1, INBOX_FORMULA_ROWS, 1).setNumberFormat('0').setDataValidation(
      SpreadsheetApp.newDataValidation().requireNumberBetween(0, MAX_LIMIT).setAllowInvalid(false).setHelpText(w[1]).build());
    ib.getRange(1, icm[w[0]] + 1).setNote(w[1] + ' The warm-up counts from the Campaign start date.');
    ib.setColumnWidth(icm[w[0]] + 1, 130);
  });
  ib.getRange(1, icm['Daily Limit'] + 1).setNote('Type a number for this Gmail\'s own daily limit (1 to ' + MAX_LIMIT +
    '). Blank = the default in Settings. Warm-up still starts new Gmails lower and climbs to this number.');
  ib.getRange(2, icm['Bounce %'] + 1, INBOX_FORMULA_ROWS, 1).setNumberFormat('0.0%');
  ib.getRange(2, icm['Reply %'] + 1, INBOX_FORMULA_ROWS, 1).setNumberFormat('0.0%');
  ib.setColumnWidth(icm['Inbox Email'] + 1, 240); ib.setColumnWidth(icm['Sender Name'] + 1, 180);
  ib.setColumnWidth(icm['Last Result'] + 1, 420);

  // Leads
  var ld = ensureSheet_(ss, SHEET.LEADS, LEAD_HEADERS);
  var lc = colMap_(ld);
  ld.setFrozenColumns(2);
  ld.getRange(2, lc['Status'] + 1, ld.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUS_LIST, true)
      .setAllowInvalid(true).build());
  ld.getRange(2, lc['Outcome'] + 1, ld.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(OUTCOMES, true)
      .setAllowInvalid(true).build());
  ['Email 1 Sent', 'Follow-up 1 Sent', 'Follow-up 2 Sent', 'Next Send',
   'Replied At', 'Bounced At', 'Imported At'].forEach(function (h) {
    ld.getRange(2, lc[h] + 1, ld.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });
  // Emails Sent must be a plain number. Formatted as a date, it reads as a date and breaks sending.
  ld.getRange(2, lc['Emails Sent'] + 1, ld.getMaxRows() - 1, 1).setNumberFormat('0');
  MESSAGE_COLS.concat(['Reply Snippet']).forEach(function (h) {
    ld.setColumnWidth(lc[h] + 1, 320);
    ld.getRange(2, lc[h] + 1, ld.getMaxRows() - 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  });
  ld.getRange(2, lc['Assigned Inbox'] + 1, ld.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(ss.getSheetByName(SHEET.INBOXES).getRange('A2:A'), true)
      .setAllowInvalid(true).build());
  addStatusColors_(ld, lc);

  // Log, Import, Do Not Contact
  var lg = ensureSheet_(ss, SHEET.LOG, LOG_HEADERS);
  lg.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  // The old Import tab is no longer used (Outreach -> Upload a lead file replaces it).
  var oldImport = ss.getSheetByName(SHEET.IMPORT);
  if (oldImport && oldImport.getLastRow() === 0) ss.deleteSheet(oldImport);
  ensureSheet_(ss, SHEET.DNC, DNC_HEADERS);

  // Dashboard (rebuilt every time, holds no data of its own)
  loadTheme_(ss);
  buildDashboard_(ss);
  styleTabs_(ss);

  // Tab order and colours
  var order = [SHEET.DASH, SHEET.LEADS, SHEET.INBOXES,
               SHEET.SETTINGS, SHEET.LOG, SHEET.DNC];
  order.forEach(function (name, idx) {
    var sh = ss.getSheetByName(name);
    ss.setActiveSheet(sh); ss.moveActiveSheet(idx + 1);
  });
  colourTabs_(ss);
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  ss.setActiveSheet(ss.getSheetByName(SHEET.DASH));
  try { addGuards_(ss); } catch (e) { console.log('Guards: ' + e.message); }

  toast_('Sheet is ready. Next: check Settings, connect your Gmails, then import leads.');
}

// ---------------------------------------------------------------- reset and guards

// Outreach -> Reset to default settings (keeps your leads). Uses the loader's third spare slot.
var KEEP_ON_RESET = ['name', 'goal', 'start', 'length', 'theme', 'layout'];

function slot3() {
  askAllPermissions_();
  var ss = ss_();
  var ui = ui_();
  if (ui) {
    var r = ui.alert('Reset to default settings?',
      'This puts the sheet back to normal:\n\n' +
      '•  Settings go back to the defaults. Your campaign name, goal, start date, length and colour theme stay.\n' +
      '•  Hidden rows and columns are shown again, and filters are removed.\n' +
      '•  Tabs, column names, formats, colours and the Dashboard are repaired.\n\n' +
      'Your leads, emails sent, replies, Log, Gmails and Do Not Contact list are NOT touched.\n\nContinue?',
      ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  var problem = headerProblems_(ss);
  if (problem) return alert_(problem);
  var changed = resetSettings_(ss);
  [SHEET.LEADS, SHEET.INBOXES, SHEET.LOG, SHEET.DNC, SHEET.SETTINGS].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (!sh) return;
    try { if (sh.getFilter()) sh.getFilter().remove(); } catch (e) { /* no filter */ }
    try { sh.showRows(1, sh.getMaxRows()); sh.showColumns(1, sh.getMaxColumns()); } catch (e) { /* nothing hidden */ }
  });
  setupSheet();
  log_(ss, me_(), '', 'RESET', '', 'Reset to default settings (' + changed + ' settings changed)', '', '');
  alert_('Done. The sheet is back to its default settings (' + changed + ' setting' + (changed === 1 ? '' : 's') +
    ' changed back), and everything is repaired.\n\nYour leads and results were not touched.');
}

// Puts every setting back to its default, except the ones in KEEP_ON_RESET. Returns how many changed.
function resetSettings_(ss) {
  var st = ss.getSheetByName(SHEET.SETTINGS);
  if (!st || st.getLastRow() < 2) return 0;
  var vals = st.getRange(2, 1, st.getLastRow() - 1, 2).getValues();
  var seen = {}, changed = 0;
  vals.forEach(function (row, i) {
    var label = String(row[0]).trim();
    var def = SETTINGS_DEF.filter(function (d) { return d.label === label; })[0];
    if (!def || seen[label] || KEEP_ON_RESET.indexOf(def.key) >= 0) { seen[label] = true; return; }
    seen[label] = true;
    if (String(row[1]) !== String(def.value)) {
      var cell = st.getRange(i + 2, 2);
      cell.clearDataValidations();
      cell.setValue(def.value);
      changed++;
    }
  });
  return changed;
}

// Input rules on Settings: wrong values are refused with a short explanation.
function settingsRules_(st) {
  var n = st.getLastRow();
  if (n < 2) return;
  var labels = st.getRange(2, 1, n - 1, 1).getValues();
  var dv = function () { return SpreadsheetApp.newDataValidation().setAllowInvalid(false); };
  var rules = {
    goal: function () { return dv().requireNumberBetween(1, 1000000).setHelpText('A number, e.g. 5000'); },
    start: function () { return dv().requireDate().setHelpText('A date, e.g. 2026-10-20'); },
    length: function () { return dv().requireNumberBetween(1, 365).setHelpText('Number of days, e.g. 11'); },
    dailyLimit: function () { return dv().requireNumberBetween(1, MAX_LIMIT).setHelpText('1 to ' + MAX_LIMIT + '. Free Gmail: 35 or less is safest'); },
    rampStart: function () { return dv().requireNumberBetween(0, MAX_LIMIT).setHelpText('0 to ' + MAX_LIMIT + ', e.g. 20 (blank = no warm-up)'); },
    followUps: function () { return dv().requireNumberBetween(0, 2).setHelpText('0, 1 or 2'); },
    fu1Days: function () { return dv().requireNumberBetween(1, 30).setHelpText('1 to 30 days, e.g. 3'); },
    fu2Days: function () { return dv().requireNumberBetween(1, 30).setHelpText('1 to 30 days, e.g. 4'); },
    startHour: function () { return dv().requireNumberBetween(0, 23).setHelpText('An hour from 0 to 23, e.g. 8'); },
    endHour: function () { return dv().requireNumberBetween(1, 24).setHelpText('An hour from 1 to 24, e.g. 18'); },
    minDelay: function () { return dv().requireNumberBetween(0, 600).setHelpText('Seconds, 0 to 600, e.g. 20'); },
    maxDelay: function () { return dv().requireNumberBetween(0, 600).setHelpText('Seconds, 0 to 600, e.g. 60'); },
    standard: function () { return dv().requireNumberBetween(0, 100000).setHelpText('A number, e.g. 350 (blank = what your active Gmails can send)'); },
    autoResume: function () { return dv().requireNumberBetween(0, 30).setHelpText('Days, 0 to 30, e.g. 2 (blank = never)'); },
    pace: function () { return dv().requireValueInList(PACES, true); },
    theme: function () { return dv().requireValueInList(THEME_NAMES, true); },
    layout: function () { return dv().requireValueInList(LAYOUT_NAMES, true); }
  };
  labels.forEach(function (l, i) {
    var def = SETTINGS_DEF.filter(function (d) { return d.label === String(l[0]).trim(); })[0];
    if (!def) return;
    var cell = st.getRange(i + 2, 2);
    if (def.key === 'weekends' || def.key === 'paused' || def.key === 'autoMove') {
      cell.setValue(toBool_(cell.getValue()));
      cell.setDataValidation(dv().requireCheckbox().build());
    } else if (rules[def.key]) {
      cell.setDataValidation(rules[def.key]().build());
    } else {
      cell.clearDataValidations();   // settings with no rule (e.g. warm-up increase, bounce pause) accept any value
    }
  });
}

// Google's own "Are you sure?" warning on the parts nobody should edit by hand.
// Warning only: people can still click OK, and the script itself is never blocked.
function addGuards_(ss) {
  var TAG = 'Outreach guard';
  var drop = function (sh) {
    if (!sh) return;
    [SpreadsheetApp.ProtectionType.SHEET, SpreadsheetApp.ProtectionType.RANGE].forEach(function (type) {
      sh.getProtections(type).forEach(function (p) {
        if (String(p.getDescription()).indexOf(TAG) === 0 && p.canEdit()) p.remove();
      });
    });
  };
  var warn = function (target, what) {
    var p = target.protect().setDescription(TAG + ': ' + what);
    p.setWarningOnly(true);
  };
  var col = function (sh, h) {
    var c = colMap_(sh)[h];
    return c === undefined ? null : sh.getRange(1, c + 1, sh.getMaxRows(), 1);
  };

  var dash = ss.getSheetByName(SHEET.DASH);
  if (dash) { drop(dash); warn(dash, 'the Dashboard is rebuilt by the script'); }
  var log = ss.getSheetByName(SHEET.LOG);
  if (log) { drop(log); warn(log, 'the Log is the record of everything sent'); }

  var ld = ss.getSheetByName(SHEET.LEADS);
  if (ld) {
    drop(ld);
    warn(ld.getRange(1, 1, 1, ld.getMaxColumns()), 'column names');
    ['Lead ID', 'Emails Sent', 'Email 1 Sent', 'Follow-up 1 Sent', 'Follow-up 2 Sent', 'Replied At',
     'Reply Snippet', 'Bounced At', 'Bounce Reason', 'Source', 'Imported At', 'Thread ID', 'Message IDs',
     'Extra Fields'].forEach(function (h) {
      var r = col(ld, h);
      if (r) warn(r, h + ' is filled in by the script');
    });
  }
  var ib = ss.getSheetByName(SHEET.INBOXES);
  if (ib) {
    drop(ib);
    warn(ib.getRange(1, 1, 1, ib.getMaxColumns()), 'column names');
    ['Connected', 'Last Run', 'Sent Today', 'Total Sent', 'Bounces', 'Bounce %', 'Replies', 'Reply %',
     'Leads Assigned', 'Leads Waiting', 'Health', 'Last Result'].forEach(function (h) {
      var r = col(ib, h);
      if (r) warn(r, h + ' is filled in by the script');
    });
  }
  var st = ss.getSheetByName(SHEET.SETTINGS);
  if (st) {
    drop(st);
    warn(st.getRange(1, 1, 1, 3), 'column names');
    warn(st.getRange(2, 1, st.getMaxRows() - 1, 1), 'setting names: change the values in column B only');
  }
  var dnc = ss.getSheetByName(SHEET.DNC);
  if (dnc) { drop(dnc); warn(dnc.getRange(1, 1, 1, dnc.getMaxColumns()), 'column names'); }
}

// Columns that newer versions of the script add. Anything else missing from a header row
// means someone renamed, deleted or moved a column, so repair must not guess.
var ADDED_LATER = {
  'Leads': ['Message', 'Follow-up 1 Message', 'Follow-up 2 Message', 'Variant'],
  'Inboxes': ['Last Result', 'Warm-up Day 1', 'Warm-up Per Day']
};

// Returns a message explaining what is wrong with the header rows, or '' if all is fine.
// Headers that only differ in capitals or spaces are fixed on the spot.
function headerProblems_(ss) {
  var tabs = [[SHEET.LEADS, LEAD_HEADERS], [SHEET.INBOXES, INBOX_HEADERS],
              [SHEET.LOG, LOG_HEADERS], [SHEET.DNC, DNC_HEADERS]];
  var problems = [];
  tabs.forEach(function (t) {
    var sh = ss.getSheetByName(t[0]);
    if (!sh || sh.getLastRow() === 0) return;
    var width = sh.getLastColumn();
    var rowsToScan = Math.min(sh.getLastRow(), 60);
    var grid = sh.getRange(1, 1, rowsToScan, width).getValues();
    var found = headerFixes_(grid[0], t[1], ADDED_LATER[t[0]] || []);
    found.fixes.forEach(function (f) { sh.getRange(1, f.col + 1).setValue(f.to); });
    if (found.fixes.length) grid[0] = sh.getRange(1, 1, 1, width).getValues()[0];
    var msg = headerVerdict_(t[0], grid, t[1], found);
    if (msg) problems.push(msg);
  });
  if (!problems.length) return '';
  return 'Nothing was changed. Set up / repair stopped because some column names are not where they should be:\n\n' +
    problems.join('\n\n') +
    '\n\nHOW TO FIX IT (easiest): File -> Version history -> See version history. Click a version from before ' +
    'the problem, check your leads are there, then click "Restore this version". Then run Set up / repair again.' +
    '\n\nOr fix row 1 by hand so the column names match exactly, then run Set up / repair again.';
}

// Which expected headers are missing, duplicated, or only differ in capitals/spaces.
function headerFixes_(row, expected, addedLater) {
  var have = row.map(function (h) { return String(h).trim(); });
  var fixes = [], missing = [], dupes = [];
  expected.forEach(function (h) {
    var exact = have.filter(function (x) { return x === h; }).length;
    if (exact > 1) dupes.push(h);
    if (exact) return;
    var loose = have.map(normHeader_).indexOf(normHeader_(h));
    if (loose >= 0 && have[loose] !== '' && expected.indexOf(have[loose]) < 0) {
      fixes.push({ col: loose, to: h });
      have[loose] = h;
    } else if (addedLater.indexOf(h) < 0) {
      missing.push(h);
    }
  });
  return { fixes: fixes, missing: missing, dupes: dupes };
}

function headerVerdict_(tab, grid, expected, found) {
  var count = function (row) {
    var r = row.map(function (x) { return String(x).trim(); });
    return expected.filter(function (h) { return r.indexOf(h) >= 0; }).length;
  };
  for (var i = 1; i < grid.length; i++) {
    if (count(grid[i]) >= Math.ceil(expected.length / 2)) {
      return '- ' + tab + ': the column names are also in row ' + (i + 1) + '. The tab was probably sorted ' +
        'with the header row included, or an earlier repair added a second set of columns.';
    }
  }
  if (count(grid[0]) < Math.ceil(expected.length / 2)) {
    return '- ' + tab + ': row 1 does not have the column names (row deleted, moved or typed over).';
  }
  if (found.dupes.length) {
    return '- ' + tab + ': these columns appear twice: ' + found.dupes.join(', ') +
      '. An earlier repair probably added new empty copies at the far right.';
  }
  if (found.missing.length) {
    return '- ' + tab + ': these columns are missing or renamed: ' + found.missing.join(', ') + '.';
  }
  if (tab === SHEET.LEADS && grid.length > 1) {
    var e = grid[0].map(function (x) { return String(x).trim(); }).indexOf('Email');
    var under = 0, elsewhere = -1;
    for (var r = 1; r < grid.length; r++) {
      if (isValidEmail_(normEmail_(grid[r][e]))) under++;
      for (var c = 0; c < grid[r].length && elsewhere < 0; c++) {
        if (c !== e && isValidEmail_(normEmail_(grid[r][c])) && String(grid[r][c]).indexOf('@') > 0 &&
            String(grid[0][c]).trim() !== 'Assigned Inbox') elsewhere = c;
      }
    }
    if (!under && elsewhere >= 0) {
      return '- Leads: the Email column is empty, but there are emails in column ' + colLetter_(elsewhere + 1) +
        '. The columns have moved out of place.';
    }
  }
  return '';
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers) {
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      // add any headers that are missing (keeps user columns)
      var have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      headers.forEach(function (h) {
        if (have.indexOf(h) < 0) {
          if (sh.getLastColumn() >= sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), 5);
          sh.getRange(1, sh.getLastColumn() + 1).setValue(h);
          have.push(h);
        }
      });
    }
    sh.getRange(1, 1, 1, sh.getLastColumn())
      .setFontWeight('bold').setBackground('#f1f3f4');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Fills the formula columns of the Inboxes tab, finding each column (and the Leads
// columns it counts) by name, so inserted or moved columns are never overwritten.
function writeInboxFormulas_(ib) {
  var ic = colMap_(ib);
  var ss = ib.getParent();
  var L = sheetLetters_(ss.getSheetByName(SHEET.LEADS));
  var col = function (h) { return colLetter_(ic[h] + 1); };
  var rows = Math.max(INBOX_FORMULA_ROWS, lastFilledRow_(ib, ic['Inbox Email'] + 1) + 10);
  var formulas = {
    'Sent Today': function (a) { return 'COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"SENT*",Log!$A:$A,">="&TODAY())'; },
    'Total Sent': function (a) { return 'COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"SENT*")'; },
    'Bounces': function (a) { return 'COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"BOUNCE")'; },
    'Bounce %': function (a, r) { return 'IFERROR(' + col('Bounces') + r + '/' + col('Total Sent') + r + ',0)'; },
    'Replies': function (a) { return 'COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"REPLY")+COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"UNSUB")'; },
    'Reply %': function (a, r) { return 'IFERROR(' + col('Replies') + r + '/COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"SENT_1"),0)'; },
    'Leads Assigned': function (a) { return 'COUNTIF(Leads!$' + L['Assigned Inbox'] + ':$' + L['Assigned Inbox'] + ',' + a + ')'; },
    'Leads Waiting': function (a) { return 'COUNTIFS(Leads!$' + L['Assigned Inbox'] + ':$' + L['Assigned Inbox'] + ',' + a +
      ',Leads!$' + L['Status'] + ':$' + L['Status'] + ',"New")'; },
    'Health': function (a, r) {
      var st = col('Status') + r, tot = col('Total Sent') + r, bp = col('Bounce %') + r;
      // Red only while paused for bounces: a Gmail turned back on is judged on its new sends.
      return 'IF(' + st + '="Paused - bounces","🔴 Paused: high bounces",IF(' + st + '<>"Active","⏸ "&' + st +
        ',IF(' + tot + '<10,"⚪ Too early to tell",IF(' + bp + '>=0.02,"🟡 Watch (bounces)","🟢 Healthy"))))';
    }
  };
  Object.keys(formulas).forEach(function (h) {
    if (ic[h] === undefined) return;
    var f = [];
    for (var r = 2; r <= rows + 1; r++) {
      var a = '$' + col('Inbox Email') + r;
      f.push(['=IF(' + a + '="","",' + formulas[h](a, r) + ')']);
    }
    ib.getRange(2, ic[h] + 1, f.length, 1).setFormulas(f);
  });
}

// Column letters by header name, e.g. { 'Email': 'B', 'Status': 'F' }.
function sheetLetters_(sh) {
  var m = colMap_(sh), out = {};
  Object.keys(m).forEach(function (h) { out[h] = colLetter_(m[h] + 1); });
  return out;
}

function addStatusColors_(ld, lc) {
  var col = colLetter_(lc['Status'] + 1);
  var range = ld.getRange(2, 1, ld.getMaxRows() - 1, ld.getLastColumn());
  var colours = [STATUS.REPLIED, STATUS.BOUNCED, STATUS.UNSUB, STATUS.SKIPPED, STATUS.NEEDS, STATUS.DONE,
                 STATUS.FAILED];
  var rules = colours.map(function (st) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + col + '2="' + st + '"')
      .setBackground(STATUS_STYLE[st][0]).setFontColor(STATUS_STYLE[st][1]).setRanges([range]).build();
  });
  ld.setConditionalFormatRules(rules);
}

// ---------------------------------------------------------------- look and feel

var BRAND = { name: 'Paramount Orbit Scouting Centre', credit: 'Designed by D\'XLNTInnovator' };
// Colour themes. Pick one in Settings -> "Colour theme", then Outreach -> Apply colour theme.
var THEMES = {
  'Navy & Gold':     { navy: '#0B1530', navy2: '#13204A', ivory: '#FBF8F1', line: '#E7DFC9', muted: '#6B7189', soft: '#C7CCE0', darkTrack: '#2A3760' },
  'Emerald & Gold':  { navy: '#0B3B2E', navy2: '#12513F', ivory: '#F8F6EF', line: '#E2DCC6', muted: '#5F6E68', soft: '#B9CFC6', darkTrack: '#1E5A48' },
  'Burgundy & Gold': { navy: '#4A0F1D', navy2: '#64182A', ivory: '#FBF6F1', line: '#EBDCCF', muted: '#77646A', soft: '#D9BFC5', darkTrack: '#6E2335' },
  // Clean and minimal: white page, charcoal text, light grey blocks, blue accent.
  'Notion Style':    { navy: '#F7F6F3', navy2: '#EFEEEA', onNavy: '#37352F', ivory: '#FFFFFF', line: '#E9E9E7', muted: '#787774',
                       soft: '#787774', darkTrack: '#E3E2E0', gold: '#2383E2', gold2: '#2383E2', paleGold: '#BCD9F5',
                       track: '#EDEDEC', ink: '#37352F', head: 'Inter', body: 'Inter' },
  // Bright and modern: purple bands, pink accents, light lavender page.
  'ClickUp Style':   { navy: '#7B68EE', navy2: '#6A57E3', onNavy: '#FFFFFF', ivory: '#F7F8FC', line: '#E6E4F7', muted: '#6B6F80',
                       soft: '#E4DFFF', darkTrack: '#9C8FF2', gold: '#FD71AF', gold2: '#FFD3E8', paleGold: '#FFC4DF',
                       track: '#F1EEFD', ink: '#292D34', head: 'Poppins', body: 'Inter' }
};
var THEME_NAMES = Object.keys(THEMES);

function themeFor_(name) {
  var base = { gold: '#C9A227', gold2: '#E8C766', paleGold: '#F1DFA4', ink: '#1D2333', track: '#EFE8D3',
    good: '#2E7D5B', bad: '#B3261E', head: 'Playfair Display', body: 'Montserrat', onNavy: '#FFFFFF' };
  var want = normHeader_(name);
  var key = THEME_NAMES.filter(function (n) {
    var k = normHeader_(n);
    return want && (k === want || k.indexOf(want) === 0);
  })[0] || 'Navy & Gold';
  var t = THEMES[key];
  Object.keys(t).forEach(function (k) { base[k] = t[k]; });
  base.strong = t.strong || (t.onNavy && t.onNavy !== '#FFFFFF' ? t.onNavy : t.navy); // headings and big numbers on white
  base.name = key;
  return base;
}

// The theme in use (read from Settings before anything is drawn).
var THEME = themeFor_('Navy & Gold');

function loadTheme_(ss) {
  try { THEME = themeFor_(readSettings_(ss).theme); } catch (e) { THEME = themeFor_('Navy & Gold'); }
  return THEME;
}

// Outreach -> Apply colour theme (uses the loader's second spare slot)
function slot2() {
  askAllPermissions_();
  var ss = ss_();
  loadTheme_(ss);
  buildDashboard_(ss);
  styleTabs_(ss);
  colourTabs_(ss);
  try { addGuards_(ss); } catch (e) { /* guards are a nice-to-have */ }
  ss.setActiveSheet(ss.getSheetByName(SHEET.DASH));
  alert_('Colour theme applied: ' + THEME.name + '.\n\nTo change it, pick another in Settings -> "Colour theme" and click this again.');
}

function colourTabs_(ss) {
  var c = {};
  c[SHEET.DASH] = THEME.gold; c[SHEET.LEADS] = THEME.navy; c[SHEET.INBOXES] = THEME.navy;
  c[SHEET.SETTINGS] = THEME.muted; c[SHEET.LOG] = THEME.muted; c[SHEET.DNC] = '#9B2C22';
  Object.keys(c).forEach(function (n) { var sh = ss.getSheetByName(n); if (sh) sh.setTabColor(c[n]); });
}
var STATUS_STYLE = {
  'New': ['#EEF1FA', '#13204A'], 'Needs message': ['#FCF1D6', '#7A5C00'],
  'In sequence': ['#E3E8F7', '#13204A'], 'Completed': ['#F6F0DC', '#7A5C00'],
  'Replied': ['#DCEFE4', '#1E6B45'], 'Bounced': ['#F7DEDA', '#9B2C22'],
  'Unsubscribed': ['#ECECEC', '#555555'], 'Do not contact': ['#ECECEC', '#555555'],
  'Send failed': ['#F7DEDA', '#9B2C22']
};
var LOGO_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAJAAAACWBAMAAADDMRyWAAAAMFBMVEUAAADuzGjw3Wjox2box2X4tGb+/gCwsGL/////f3+/vz//AAB/f3//vz///6p/fwB02wQIAAAAEHRSTlMA9BWgXQUBAwECBAECBAMCvaDEvgAADM5JREFUeNqtWmtwW+WZfvQdnSPLiSy9kmFT0jifji4hBLBkZzrMlItkh+6WDkFRcEKZIVU9JYHSUg9TB3rZ1s2PEmCHKmEKJLNDBdOU27SoYdvtAHXczG7ZbRNXCZBmocjHSgstJM7JBV8k62h/HN1s2daRne+X9fk9j973+97rcwTUXw/EcYmWZEBGMCDTPe1QL4U6Ijl/f0kMu5tczfWlWH2RjwPaZyJ1pUz1gbhJNX0ydUk0QkGOXwKgwkHA4rgEpjVnbRDGx5fuR/lCEwrdk+qSTbMCDIcDS9co941zKoSTuSVrBAXMkb+8b+lAKUchg/MfLx0ICn4E9urSgULQ7g/kV/BFRer/oicaK8W/ifwCBSKLing8VdHWIhCPUitbBM5VkNG9vmSLKFCIh2nt0CKQnqD1RK1bikBmCn1boABvPNa8ZwAA7Y4kADBma3c6XjFdyDV4a4ydgQyhGx84AECOaVA3DgYK0UY1YrALp6mgikUNrFP21eo/v6a2K0qjRxTlfo8/ihiAZazTz8gB0UzOfY3XMVYuZ81mCvWRU0Ik6BIb9ezs3m34MUcWAHKAmuRg+JyqrexbQoZkppbVKo2qGmO21Ty5+FiTNCAACDC78deDSwjaOziUlIMB2VwgH4nNK2euB+TQv0zM4cNRx9jw4jWKcUABcoBmwvFvLB4oUq4euY3ctHPxyX/iE5gmTFNaDtDGJ1ba1EVqxHK6TA7AXzJoDizWNKEokAfQ3IvMfzYU/S/JT1cqP3gpXC6+HjA1FGpxACWHSbop7JI2EQDgHjdx45n7PrANXXL50twut0t0UwwAmLlOmqxeW+ALEhEvxmck2Op2NZuIxwBIe6lVNHhGvS/JIwoAXsxh1ylVx5LdGMjfZbQMhSlIsrernHXJ4XYxQdcIzE0hbiyjbSai1sqGaKYvuEkUiA8UD8kZN2Ja9vZByIDse7AU0wW8A9ylBy+g7QF7wIBCFkbUAbezgs7d9Nge8gvEdYt4mK42EGsWzSK83/OHy85W+gfrR6/+pkk8b2mCCgBT05My1LqmjYudp698eeUHVY2IWhB1Ed0Rp07hRJ+haxMBaaCqVNLlvQJFhLJH752vmZi163sZyA5Uh+xVKpACSpf+eCC/wwjQezNDqfkuKG/N2Dmt4M+88TRCQ/j7+3rRSuk72imk+hoHSjqE/Myd6UGw/oaBlv1N0SxNM102HTDlGwbKFtDWmq+cNAD8j6KtjTQKxG7D5QPazL3nTkHkjQJ9qw3Npcax5BPT25DparTScn78tfFZmSz7vZHjmxvV6INUYbJ2U9HcvDEgy3ehDdbs3pRBc4MaaSYEahui/JeQebIxoO+0QalNGdoYZ5saA1I5yyRqt9ep+duSDd3a+ZRJnGPef9jU8pHaiEZiFG2PlD8NVPedJ5RGgNhtcMw17muPQ9vVCNCn2vCxYy6JdKDQ2GE7hL9EAAGYZci4oq3lxoGkLkUTAUwCmKnBs6cgBowDFZ5D24ZKwap6UvwFMoeMAwm3QuVzSlx8hrNx40ArVJaJF7vHWce0Ts1vShp3yJRulCWrp5Sq//zbdK1LzquRmEHz9wAgr6fIag1yJqQMA+VNkFUA+rA1yyW31ZaSeYG+2YYVanGGqOlkWmrb23mB3nUIr5RCvx/AjDTgULSVcWNAzKlo39enGjBtNtCuDPiQsVsTnm259iMdyARxosZb8c45Yxq5S0dUbIxmhoTWxgtmY0BXOYRf69YoHLkI+mZVV0ehYAiIORXtoWLLDpMphVAJqKmn3y/5OhzaPxnq3ESh3FBHwq1wU4nS9hUvyzybT5pn8Ns4OYnr9Zboyn+cH6fseAEArP/+zGse94qpdSulyfPv5A3cGh+9kDlZ1GiPBkDQAFh2bPfalDNAGgAzMnIxM13mL2EGnXC7GABLnIWpsvQqeXhB0345rlxzphiW6pRpIviPnAbripfaTwIePmW1rrOoOBM4CRy+cUGNeJhKE5vEyBEJt4oAZ0Gi9UVFWZg4B/ZCXghn+V5yisA9R34IWBkFeLjVouN0AM9Ht2/v7eHokoB+eBYcl5hAgbW+LQCe2mJhFIiEW1lzc5ioCw8XH2tKICb54SEKLOBPfW6SOSDLPkA2UygSbBW5m+hmfKsitJVxeIgWHE6j1ArWHSSizpuZmUI86IybiTrwsyqhP8RYmMhVAprLGVrGbeaWseKH615rsYNGL1ytmMZe7qlUPff/sXYFjM4UqcG5rv9T9sm2D0sfTmUtTYFzFzek2I1ahQ3o/fR/ezUVwg1vNk3+XZ1HI+kKUgB4xszvMtlmH1Xtp0Uhj/Y3yy1O06r3WHgY8BwRr09NTM4bsGYiWs8BvA6IcLssjIicljIJtZ/DGySiLojHqXX+tzhxN1EX8PxD90Haz3nYxRiRK5IqDeIRsG4icnH0iGZyzs/g/tpNN+OpYrqQIuFWxoiuL7bbvVuhq7Oe4wUkFuQ4JObHixUiKuhkZnIt5wDQ21+Ecd2MZg7GaEFuEvBX/hwip2imwBYAO3qAaDfp6vTEAP8mcu5cIB81bT5QNbIFCpET6f8KSN6OfZDdhwAw+xHmfxlgX34JLVc0Rrru9XFA7iYicnUBB2IAwAVyisYxePxeXxRg3k4dhuNXujlMDFIoYZj//XH0ZwCi3cESjPhimVqanwSaiXGv3PMgAMgbglSCYeV3E19lRKHUPKSvdBvb/BCA3X9U8pbnAYBx+Yzercn2tMJ6rCVbxFw4tTB5X0lvsndDZzHRuzbIqNIGkFKbiXhiHhpami4PmQVVK7eNzD22bQD9//FwlRNHDtrhParNA9Q81VKjl0zpbQMQb02lq3fXpK9WhNNcmb+cVS9X5wY5AkDc+lCSo5qB3oUwEd+yAMPu5TgLgIA0mk4AwIPvndgdQXM2PFQ52Ed3esbgfWfcKFX/cNvP13yYAADplnOpm8qN7f7tnjG4h2caNgvogU5dmg3f6h/eX95OfMUGs7pSf7L/Mc8YhNPyM6H6Nz+TkZf8YpCIQmIfgOUJeIhc3GfEg5Yv81dfQQJhcrnJxZc9gF1cx2Hw8gEjWHJJavkasDBRiAXJxcHAwkQuLsFDl91X16UZdQG+A/I+31U9AAsSdVgiZiLqgjdI5OJg3UTOmIG+jypv6bqJqBUJid9ORC4iWh9h3iCRa91Aveu3fvEVAB5HGpALwwA8R/btgJjz2hQAkDUFALPNdOu5/ejiDVVSrH1QzAHofYbdVE4bntOZbYm6QE2TLDxceUTxvaeXIi3htaf1lDLIHjfSHv8qAubt7OzsXN/F0VTuZdgWgMmyzAE5ZizDNpU7Ouk5vVRG+wDgsN6P9NxhPOcvf/BOX8+dB8CuTgLoLZ+HdFheG0PDK+7lsN75HAe6Q+qCknW6bk6Z9rQCyKtTpovZJQEpYByaAni/sGBs1Xm/9rlBQEsDgLAysBTTAN2dWftgHbl6QEyDDAifTTANS1t3v1Bkt+pX5u3bFxa4V5avTBr71ma+NK0lACbIQHrJBwCYOClgNijzf10tMXdyVlfkeywC8KAsd7eyZWv67wD2WfzwRQ8AjG29M3b31ijA5uhaWR9YDNgBiff7dkIOr+EwcddRIDwCBRgYACBlgViiePOI9/FM7QFqmdJRWCeAZHL0EGDiri6W3P/9D1YNe4999a3fBY54WoS3dz9RsAun179vPlbIt89BXtoCr97gCD1xzcFrL6gdr7tVuN82A/EcVDWX6hjmytg1mnmM8leG9jiEvPO3nUevgDs1B3908WABGGpLsVMIDEfe5i4tawZWoTNyk3c6uWkkRYU/MfsRc0vAPTrG7KvfEMSv/WhOlurG3+mImv23m85OO94AzEAa6fBIpA+vLg+NTvrfVTDNgGuv+D0d841M/6CFBdM1linHS0N65sA222XwfTZhhibDfexCn5cXjgKjE8mfqkgB1vFHdgvvA23qqjdqU4atHImPxuL/mkMOMANncc7WMnrWrgF4MXLwEAeACctEkX/5xFeTP/KHWIVU7rMV2RpGdCazsc129C0AEctPVh09OuOpXEcNThLA+RMnqmrFv+hnxO4PHDukE7Jbn3XEv1n1UGDI+WKNaZsHNZZW8bG97Op3wAx8feqWyJDSodpHABxgb2duqHoTdrBlpLMGaBBt0T2yqTQ/K6YOx5tm4Oncfnw+p0IeAWD60p8UlVWTaUjPcf/jw9emmKNIau3apQoTKJIbMeZjPCkDEGX4EOWADDA55qE5lnO5FXJETogylokcMTlSTrVsW0JvLqVbknvvr+pMJrpr65np+qSy89FK7rFMSVlgd7GyPikN4R4A0tN4ElYA9wCI44dzebYVwCMxKxAHpCHg3piB3/r5at/LXSfVjmn/D7XFv+JQUwAKAAAAAElFTkSuQmCC';

// Outreach -> About (uses the loader's first spare slot, so no new loader is needed)
function slot1() {
  alert_(BRAND.name + '\n\nVersion ' + CORE_VERSION + '\n\n' + BRAND.credit);
}

// The Dashboard is rebuilt from scratch every time Set up / repair runs. It holds no data.
// Layout: margin A, then four 3-column cards (B-D, F-H, J-L, N-P) with thin gaps (E, I, M).
// Hidden column S holds the calculations the cards show.
function buildDashboard_(ss) {
  var old = ss.getSheetByName(SHEET.DASH);
  var d = ss.insertSheet(SHEET.DASH + ' (building)', 0);
  if (old) ss.deleteSheet(old);
  d.setName(SHEET.DASH);

  var T = THEME;
  var V = function (label) { return 'VLOOKUP("' + label + '",Settings!$A:$B,2,FALSE)'; };
  var Lt = sheetLetters_(ss.getSheetByName(SHEET.LEADS));
  var It = sheetLetters_(ss.getSheetByName(SHEET.INBOXES));
  var LC = function (h) { return 'Leads!$' + Lt[h] + ':$' + Lt[h]; };
  var LC2 = function (h) { return 'Leads!$' + Lt[h] + '$2:$' + Lt[h]; };
  var IC2 = function (h) { return 'Inboxes!$' + It[h] + '$2:$' + It[h]; };
  var LOG = function (ev, today) {
    return 'COUNTIFS(Log!$D:$D,"' + ev + '"' + (today ? ',Log!$A:$A,">="&TODAY()' : '') + ')';
  };

  // page
  var ROWS = 120, COLS = 23;
  if (d.getMaxRows() > ROWS) d.deleteRows(ROWS + 1, d.getMaxRows() - ROWS);
  if (d.getMaxColumns() > COLS) d.deleteColumns(COLS + 1, d.getMaxColumns() - COLS);
  d.setHiddenGridlines(true);
  d.getRange(1, 1, ROWS, COLS).setBackground(T.ivory).setFontFamily(T.body).setFontSize(10)
    .setFontColor(T.ink).setVerticalAlignment('middle');
  [24, 95, 95, 95, 16, 95, 95, 95, 16, 95, 95, 95, 16, 95, 95, 95, 24].forEach(function (w, i) { d.setColumnWidth(i + 1, w); });
  d.hideColumns(18, 6);   // R-W: calculations and chart data

  // calculations (hidden column S)
  var calc = [
    ['goal', '=' + V('Goal (delivered messages)')],
    ['start', '=INT(' + V('Campaign start date') + ')'],
    ['length', '=' + V('Campaign length (days)')],
    ['sentAll', '=' + LOG('SENT*')], ['sentToday', '=' + LOG('SENT*', 1)],
    ['firstAll', '=' + LOG('SENT_1')], ['firstToday', '=' + LOG('SENT_1', 1)],
    ['fuAll', '=' + LOG('SENT_FU*')], ['fuToday', '=' + LOG('SENT_FU*', 1)],
    ['replyAll', '=' + LOG('REPLY') + '+' + LOG('UNSUB')], ['replyToday', '=' + LOG('REPLY', 1) + '+' + LOG('UNSUB', 1)],
    ['bounceAll', '=' + LOG('BOUNCE')], ['bounceToday', '=' + LOG('BOUNCE', 1)],
    ['unsubAll', '=' + LOG('UNSUB')],
    ['delivered', '=MAX(0,{sentAll}-{bounceAll})'],
    ['progress', '=IFERROR(MIN(1,{delivered}/{goal}),0)'],
    ['toGo', '=MAX(0,{goal}-{delivered})'],
    ['dayNum', '=MAX(1,MIN({length},TODAY()-{start}+1))'],
    ['daysLeft', '=MAX(0,{start}+{length}-TODAY())'],
    ['needed', '=IF({daysLeft}=0,{toGo},ROUNDUP({toGo}/{daysLeft}))'],
    ['expected', '=MIN({goal},ROUND({goal}*{dayNum}/{length}))'],
    ['replyRate', '=IFERROR({replyAll}/{firstAll},0)'],
    ['bounceRate', '=IFERROR({bounceAll}/{sentAll},0)'],
    ['bounceRateToday', '=IFERROR({bounceToday}/{sentToday},0)'],
    ['interested', '=COUNTIF(' + LC('Outcome') + ',"Interested")'],
    ['fu1All', '=' + LOG('SENT_FU1')], ['fu2All', '=' + LOG('SENT_FU2')],
    ['fuDue', '=COUNTIFS(' + LC('Status') + ',"In sequence",' + LC('Next Send') + ',"<"&(TODAY()+1))'],
    ['fuNext3', '=COUNTIFS(' + LC('Status') + ',"In sequence",' + LC('Next Send') + ',">="&(TODAY()+1),' + LC('Next Send') + ',"<"&(TODAY()+4))'],
    ['fuOverdue', '=COUNTIFS(' + LC('Status') + ',"In sequence",' + LC('Next Send') + ',"<"&(NOW()-1))'],
    ['fuReplies', '=SUMPRODUCT(ISNUMBER(' + LC2('Replied At') + ')*ISNUMBER(' + LC2('Follow-up 1 Sent') + ')*(' +
      LC2('Replied At') + '>' + LC2('Follow-up 1 Sent') + '))'],
    ['needOutcome', '=COUNTIFS(' + LC('Status') + ',"Replied",' + LC('Outcome') + ',"")'],
    ['followUp', '=COUNTIF(' + LC('Outcome') + ',"Interested")+COUNTIF(' + LC('Outcome') + ',"Follow up later")'],
    ['meetings', '=COUNTIF(' + LC('Outcome') + ',"Meeting booked")'],
    ['customers', '=COUNTIF(' + LC('Outcome') + ',"Customer")'],
    ['leads', '=COUNTA(' + LC2('Email') + ')'],
    ['waiting', '=COUNTIF(' + LC('Status') + ',"New")'],
    ['inSeq', '=COUNTIF(' + LC('Status') + ',"In sequence")'],
    ['completed', '=COUNTIF(' + LC('Status') + ',"Completed")'],
    ['activeInboxes', '=COUNTIF(' + IC2('Status') + ',"Active")'],
    ['inboxes', '=COUNTA(' + IC2('Inbox Email') + ')'],
    ['capacity', '=ARRAYFORMULA(SUM(IF(' + IC2('Status') + '="Active",IF(' + IC2('Daily Limit') + '="",' +
      V('Default daily limit per inbox') + ',' + IC2('Daily Limit') + '),0)))'],
    ['dnc', '=COUNTA(\'Do Not Contact\'!$A$2:$A)'],
    ['campaign', '=' + V('Campaign name')]
  ];
  var at = {};
  calc.forEach(function (c, i) { at[c[0]] = '$S$' + (i + 1); });
  var X = function (f) { return f.replace(/\{(\w+)\}/g, function (m, k) { return at[k]; }); };
  d.getRange(1, 18, calc.length, 2).setValues(calc.map(function (c) { return [c[0], '']; }));
  d.getRange(1, 19, calc.length, 1).setFormulas(calc.map(function (c) { return [X(c[1])]; }));

  // header band
  [[1, 10], [2, 46], [3, 26], [4, 22], [5, 4], [6, 16]].forEach(function (h) { d.setRowHeight(h[0], h[1]); });
  d.getRange(1, 1, 4, 17).setBackground(T.navy);
  d.getRange(5, 1, 1, 17).setBackground(T.gold);
  d.getRange('C2:L2').merge().setValue(BRAND.name).setFontFamily(T.head).setFontSize(24)
    .setFontWeight('bold').setFontColor(T.onNavy).setVerticalAlignment('bottom');
  d.getRange('C3:L3').merge().setFormula(X('=UPPER({campaign})&"   ·   DAY "&{dayNum}&" OF "&{length}'))
    .setFontColor(T.gold2).setFontWeight('bold').setFontSize(9).setVerticalAlignment('top');
  // Replies waiting on you (Outreach -> Replies: set outcomes & follow-ups)
  d.getRange('C4:P4').merge().setFormula(X('="📬 "&{needOutcome}&" replies need an outcome   ·   🔁 "&{followUp}&" to follow up   ·   ⭐ "&{interested}&" interested   ·   📅 "&{meetings}&" meetings"'))
    .setFontColor(T.onNavy).setFontWeight('bold').setFontSize(10).setVerticalAlignment('middle');
  d.getRange('N2:P2').merge().setValue('TODAY').setFontColor(T.soft).setFontSize(8)
    .setHorizontalAlignment('right').setVerticalAlignment('bottom');
  d.getRange('N3:P3').merge().setFormula('=TEXT(TODAY(),"ddd d mmm yyyy")').setFontColor(T.gold2)
    .setFontWeight('bold').setFontSize(12).setHorizontalAlignment('right').setVerticalAlignment('top');
  try {
    var img = d.insertImage(Utilities.newBlob(Utilities.base64Decode(LOGO_PNG_B64), 'image/png', 'logo.png'), 2, 1);
    img.setHeight(74).setWidth(71).setAnchorCellXOffset(10).setAnchorCellYOffset(8);
  } catch (e) { /* the logo is a nice-to-have */ }

  // cards
  var COLS4 = [2, 6, 10, 14];
  var num = '#,##0', pct = '0.0%';
  var bar = function (frac, colour) {
    return '=SPARKLINE(MIN(1,MAX(0,IFERROR(' + frac + ',0))),{"charttype","bar";"max",1;"color1",' +
      (colour || '"' + T.gold + '"') + '})';
  };
  var section = function (row, title) {
    d.setRowHeight(row, 30);
    d.getRange(row, 2, 1, 15).setBorder(null, null, true, null, null, null, T.gold, SpreadsheetApp.BorderStyle.SOLID);
    d.getRange(row, 2).setValue(title).setFontFamily(T.head).setFontSize(13).setFontWeight('bold')
      .setFontColor(T.strong).setVerticalAlignment('bottom');
  };
  var cardRow = function (row, cards) {
    [[0, 24], [1, 44], [2, 22], [3, 12], [4, 10], [5, 14]].forEach(function (h) { d.setRowHeight(row + h[0], h[1]); });
    cards.forEach(function (c, i) {
      var col = COLS4[i], dark = !!c.dark;
      var box = d.getRange(row, col, 5, 3);
      box.setBackground(dark ? T.navy : '#FFFFFF').setHorizontalAlignment('center');
      box.setBorder(true, true, true, true, null, null, dark ? T.navy : T.line, SpreadsheetApp.BorderStyle.SOLID);
      d.getRange(row, col, 1, 3).setBorder(true, null, null, null, null, null, T.gold, SpreadsheetApp.BorderStyle.SOLID_THICK);
      d.getRange(row, col, 1, 3).merge().setValue(c.label.toUpperCase()).setFontSize(8).setFontWeight('bold')
        .setFontColor(dark ? T.soft : T.muted).setVerticalAlignment('bottom');
      d.getRange(row + 1, col, 1, 3).merge().setFormula(X(c.value)).setNumberFormat(c.fmt || num)
        .setFontFamily(T.head).setFontSize(26).setFontWeight('bold').setFontColor(dark ? T.gold2 : T.strong);
      d.getRange(row + 2, col, 1, 3).merge().setFormula(X(c.sub)).setFontSize(9)
        .setFontColor(dark ? T.soft : T.muted).setVerticalAlignment('top');
      var b = d.getRange(row + 3, col + 0, 1, 3).merge();
      if (c.bar) b.setFormula(X(c.bar)).setBackground(dark ? T.darkTrack : T.track);
    });
  };

  // Other layouts (Settings -> Dashboard layout) draw their own body between the header and the footer.
  var layout = layoutFor_(ss);
  var ctx = { ss: ss, d: d, T: T, X: X, V: V, LC: LC, LC2: LC2, IC2: IC2, It: It, bar: bar,
              section: section, cardRow: cardRow, num: num, pct: pct };
  if (layout !== 'Classic' && DASH_LAYOUTS_[layout]) {
    dashFooter_(d, T, followUpPanel_(ctx, DASH_LAYOUTS_[layout](ctx)));
    return;
  }

  // goal tracker: where we are against the goal, and where we should be by today
  var G = 6, g0 = 7;
  [[g0, 30], [g0 + 1, 34], [g0 + 2, 18], [g0 + 3, 30], [g0 + 4, 20], [g0 + 5, 12]].forEach(function (h) { d.setRowHeight(h[0], h[1]); });
  d.getRange(g0, 2, 5, 15).setBackground('#FFFFFF')
    .setBorder(true, true, true, true, null, null, T.line, SpreadsheetApp.BorderStyle.SOLID);
  d.getRange(g0, 2, 1, 15).setBorder(true, null, null, null, null, null, T.gold, SpreadsheetApp.BorderStyle.SOLID_THICK);
  d.getRange(g0, 2, 1, 7).merge().setValue('  GOAL TRACKER').setFontFamily(T.head).setFontSize(13)
    .setFontWeight('bold').setFontColor(T.strong);
  d.getRange(g0, 10, 1, 7).merge().setHorizontalAlignment('right').setFontWeight('bold').setFontSize(10).setFormula(X(
    '=IF({delivered}>={goal},"🏆 Goal reached",IF({delivered}>={expected},"✅ On track: ahead by "&TEXT({delivered}-{expected},"#,##0"),' +
    '"⚠️ Behind by "&TEXT({expected}-{delivered},"#,##0")&": need "&TEXT({needed},"#,##0")&" a day"))&"  "'));
  d.getRange(g0 + 1, 2, 1, 15).merge().setFormula(X(
    '=SPARKLINE({MIN({goal},{delivered}),MAX(0,MIN({goal},{expected})-{delivered})},' +
    '{"charttype","bar";"max",MAX(1,{goal});"color1","' + T.gold + '";"color2","' + T.paleGold + '"})'))
    .setBackground(T.track);
  [[2, 4, '25%'], [6, 4, '50%'], [10, 4, '75%'], [14, 3, '100%  ']].forEach(function (m) {
    d.getRange(g0 + 2, m[0], 1, m[1]).merge().setValue(m[2]).setHorizontalAlignment('right')
      .setFontSize(8).setFontColor(T.muted);
  });
  d.getRange(g0 + 3, 2, 1, 15).merge().setHorizontalAlignment('center').setFontFamily(T.head).setFontSize(15)
    .setFontColor(T.strong).setFormula(X('=TEXT({delivered},"#,##0")&" of "&TEXT({goal},"#,##0")&" delivered   ·   "&' +
    'TEXT({progress},"0.0%")&"   ·   "&TEXT({toGo},"#,##0")&" to go   ·   day "&{dayNum}&" of "&{length}'));
  d.getRange(g0 + 4, 2, 1, 15).merge().setHorizontalAlignment('center').setFontSize(8).setFontColor(T.muted)
    .setValue('Gold = delivered so far.   Light gold = what should be done by today to finish on time.');

  section(G + 7, 'Today');
  cardRow(G + 8, [
    { label: 'Sent today', value: '={sentToday}', sub: '="Needed per day: "&TEXT({needed},"#,##0")', bar: bar('{sentToday}/{needed}') },
    { label: 'Replies today', value: '={replyToday}', sub: '="Replies in total: "&TEXT({replyAll},"#,##0")' },
    { label: 'Bounces today', value: '={bounceToday}', sub: '="Bounce rate today: "&TEXT({bounceRateToday},"0.0%")' },
    { label: 'New people contacted today', value: '={firstToday}', sub: '="Follow-ups sent today: "&TEXT({fuToday},"#,##0")' }
  ]);
  section(G + 14, 'All time');
  cardRow(G + 15, [
    { label: 'Delivered', dark: true, value: '={delivered}', sub: '="of "&TEXT({goal},"#,##0")&" goal  ·  "&TEXT({progress},"0%")&"  ·  "&TEXT({toGo},"#,##0")&" to go"', bar: bar('{progress}') },
    { label: 'Sent in total', value: '={sentAll}', sub: '="First emails "&TEXT({firstAll},"#,##0")&"  ·  Follow-ups "&TEXT({fuAll},"#,##0")' },
    { label: 'Replies in total', value: '={replyAll}', sub: '="Unsubscribed: "&TEXT({unsubAll},"#,##0")' },
    { label: 'Bounces in total', value: '={bounceAll}', sub: '="Bounce rate "&TEXT({bounceRate},"0.0%")&"  ·  keep under 2%"',
      bar: bar('{bounceRate}/0.05', 'IF({bounceRate}>=0.02,"' + T.bad + '","' + T.good + '")') }
  ]);
  section(G + 21, 'Results');
  cardRow(G + 22, [
    { label: 'Reply rate', value: '={replyRate}', fmt: pct, sub: '=TEXT({replyAll},"#,##0")&" replies from "&TEXT({firstAll},"#,##0")&" people"', bar: bar('{replyRate}/0.1') },
    { label: 'Interested', value: '={interested}', sub: '="Customers: "&TEXT({customers},"#,##0")' },
    { label: 'Meetings booked', value: '={meetings}', sub: '="From the Outcome column"' },
    { label: 'Do not contact', value: '={dnc}', sub: '="Never emailed again"' }
  ]);
  section(G + 28, 'Pipeline');
  cardRow(G + 29, [
    { label: 'Leads in total', value: '={leads}', sub: '="Waiting to start: "&TEXT({waiting},"#,##0")' },
    { label: 'In sequence', value: '={inSeq}', sub: '="Completed: "&TEXT({completed},"#,##0")' },
    { label: 'Days left', value: '={daysLeft}', sub: '="Day "&{dayNum}&" of "&{length}&"  ·  need "&TEXT({needed},"#,##0")&" a day"', bar: bar('{dayNum}/{length}') },
    { label: 'Active Gmails', value: '={activeInboxes}&" of "&{inboxes}', sub: '="Capacity: "&TEXT({capacity},"#,##0")&" emails a day"', bar: bar('{activeInboxes}/{inboxes}') }
  ]);

  // panel helper
  var panel = function (row, col, width, title) {
    d.setRowHeight(row, 32);
    d.getRange(row, col, 1, width).merge().setValue('  ' + title).setBackground(T.navy).setFontColor(T.onNavy)
      .setFontFamily(T.head).setFontSize(13).setFontWeight('bold')
      .setBorder(null, null, true, null, null, null, T.gold, SpreadsheetApp.BorderStyle.SOLID_THICK);
  };
  var colHead = function (row, cells) {
    cells.forEach(function (c) {
      var r = d.getRange(row, c[0], 1, c[2] || 1);
      if ((c[2] || 1) > 1) r.merge();
      r.setValue(c[1]).setFontSize(8).setFontWeight('bold').setFontColor(T.muted).setBackground('#FFFFFF')
        .setHorizontalAlignment(c[3] || 'center');
    });
  };

  // leads by status (B-H) and results by angle (J-P)
  var P = G + 36;
  panel(P, 2, 7, 'Leads by Status');
  panel(P, 10, 7, 'Results by Angle');
  d.getRange(P + 1, 2, 1, 7).setBackground('#FFFFFF');
  d.getRange(P + 1, 10, 1, 7).setBackground('#FFFFFF');
  colHead(P + 1, [[2, 'STATUS', 3], [5, '', 1], [6, 'LEADS', 1], [7, 'SHARE', 2]]);
  colHead(P + 1, [[10, 'ANGLE', 2, 'left'], [12, 'EMAILED'], [13, ''], [14, 'REPLIES'], [15, 'REPLY %'], [16, 'POSITIVE']]);
  var statusRows = STATUS_LIST.concat(['No Gmail assigned', 'Total leads']);
  statusRows.forEach(function (st, i) {
    var r = P + 2 + i;
    d.setRowHeight(r, 24);
    d.getRange(r, 2, 1, 7).setBackground(i % 2 ? T.ivory : '#FFFFFF');
    var lab = d.getRange(r, 2, 1, 3).merge().setValue(st).setHorizontalAlignment('center');
    var f;
    if (st === 'No Gmail assigned') f = '=COUNTIFS(' + LC2('Email') + ',"<>",' + LC2('Assigned Inbox') + ',"")';
    else if (st === 'Total leads') f = X('={leads}');
    else f = '=COUNTIF(' + LC('Status') + ',"' + st + '")';
    d.getRange(r, 6).setFormula(f).setNumberFormat(num).setFontWeight('bold').setHorizontalAlignment('center');
    d.getRange(r, 7, 1, 2).merge().setFormula(X('=IF({leads}=0,"",SPARKLINE(F' + r + '/{leads},{"charttype","bar";"max",1;"color1","' + T.gold + '"}))'))
      .setBackground(T.track);
    if (STATUS_STYLE[st]) lab.setBackground(STATUS_STYLE[st][0]).setFontColor(STATUS_STYLE[st][1]).setFontWeight('bold');
    if (st === 'Total leads') d.getRange(r, 2, 1, 7).setFontWeight('bold').setBorder(true, null, null, null, null, null, T.line, SpreadsheetApp.BorderStyle.SOLID);
  });
  var lastStatusRow = P + 1 + statusRows.length;
  d.getRange(P + 1, 2, statusRows.length + 1, 7).setBorder(true, true, true, true, null, null, T.line, SpreadsheetApp.BorderStyle.SOLID);

  var VAR = 'INDEX(Leads!$A:$BZ,0,MATCH("Variant",Leads!$1:$1,0))';
  var ANGLES = 'FILTER(' + VAR + ',' + VAR + '<>"",' + VAR + '<>"Variant")';
  var angleRows = lastStatusRow - P - 1;
  // The most-used angles, one per row, as many as the panel has rows.
  var TOP = 'QUERY(' + ANGLES + ',"select Col1, count(Col1) group by Col1 order by count(Col1) desc label count(Col1) \'\'",0)';
  for (var k = 1; k <= angleRows; k++) {
    // One cell per angle (no list spilling down), so nothing below can ever cause #REF!.
    d.getRange(P + 1 + k, 10).setFormula('=IFERROR(INDEX(' + TOP + ',' + k + ',1),"")');
  }
  for (var ar = P + 2; ar <= lastStatusRow; ar++) {
    var A = '$J' + ar;
    d.getRange(ar, 10, 1, 7).setBackground((ar - P) % 2 ? T.ivory : '#FFFFFF');
    d.getRange(ar, 12, 1, 5).setFormulas([[
      '=IF(' + A + '="","",COUNTIFS(' + VAR + ',' + A + ',' + LC('Emails Sent') + ',">0"))', '',
      '=IF(' + A + '="","",COUNTIFS(' + VAR + ',' + A + ',' + LC('Status') + ',"Replied")+COUNTIFS(' + VAR + ',' + A + ',' + LC('Status') + ',"Unsubscribed"))',
      '=IF(' + A + '="","",IFERROR(N' + ar + '/L' + ar + ',0))',
      '=IF(' + A + '="","",COUNTIFS(' + VAR + ',' + A + ',' + LC('Outcome') + ',"Interested")+COUNTIFS(' + VAR + ',' + A + ',' + LC('Outcome') + ',"Meeting booked"))'
    ]]).setHorizontalAlignment('center');
    d.getRange(ar, 15).setNumberFormat(pct).setFontWeight('bold');
  }
  d.getRange(P + 1, 10, statusRows.length + 1, 7).setBorder(true, true, true, true, null, null, T.line, SpreadsheetApp.BorderStyle.SOLID);
  var nAngles = 'IFERROR(COUNTUNIQUE(' + ANGLES + '),0)';
  d.getRange(lastStatusRow + 1, 10, 1, 7).merge().setFormula('=IF(' + nAngles + '>' + angleRows + ',"Showing the ' + angleRows +
    ' most-used of "&' + nAngles + '&" angles. ","")&"Judge an angle only after about 100 leads emailed with it. Positive = interested + meetings."')
    .setFontStyle('italic').setFontSize(8).setFontColor(T.muted);

  // day by day
  var top = lastStatusRow + 3;
  panel(top, 2, 15, 'Day by Day');
  d.getRange(top + 1, 2, 1, 15).setBackground('#FFFFFF');
  colHead(top + 1, [[2, 'DAY'], [3, 'DATE'], [4, 'SENT'], [6, 'FIRST EMAILS'], [7, 'FOLLOW-UPS'], [8, 'REPLIES'],
    [10, 'BOUNCES'], [11, 'SENT PER DAY', 6]]);
  var rows = [];
  for (var n = 0; n < 30; n++) {
    var r = top + 2 + n;
    var cnt = function (ev) {
      return '=IF($C' + r + '="","",COUNTIFS(Log!$D:$D,"' + ev + '",Log!$A:$A,">="&$C' + r + ',Log!$A:$A,"<"&($C' + r + '+1)))';
    };
    rows.push([
      X('=IF(' + n + '<{length},' + (n + 1) + ',"")'),
      X('=IF($B' + r + '="","",{start}+' + n + ')'),
      cnt('SENT*'), '', cnt('SENT_1'), cnt('SENT_FU*'),
      '=IF($C' + r + '="","",COUNTIFS(Log!$D:$D,"REPLY",Log!$A:$A,">="&$C' + r + ',Log!$A:$A,"<"&($C' + r + '+1))+COUNTIFS(Log!$D:$D,"UNSUB",Log!$A:$A,">="&$C' + r + ',Log!$A:$A,"<"&($C' + r + '+1)))',
      '', cnt('BOUNCE'),
      '=IF($C' + r + '="","",SPARKLINE($D' + r + ',{"charttype","bar";"max",MAX(1,MAX($D$' + (top + 2) + ':$D$' + (top + 31) + '));"color1","' + T.gold + '"}))'
    ]);
  }
  d.getRange(top + 2, 2, 30, 10).setFormulas(rows).setHorizontalAlignment('center');
  for (var k = 0; k < 30; k++) {
    var rr = top + 2 + k;
    d.setRowHeight(rr, 22);
    d.getRange(rr, 2, 1, 15).setBackground(k % 2 ? T.ivory : '#FFFFFF');
    d.getRange(rr, 11, 1, 6).merge();
  }
  d.getRange(top + 2, 3, 30, 1).setNumberFormat('ddd d mmm');
  d.getRange(top + 2, 4, 30, 1).setFontWeight('bold');
  d.getRange(top + 1, 2, 31, 15).setBorder(true, true, true, true, null, null, T.line, SpreadsheetApp.BorderStyle.SOLID);

  // chart
  var chartRow = top + 34;
  var chart = d.newChart().asColumnChart()
    .addRange(d.getRange(top + 1, 3, 31, 1))
    .addRange(d.getRange(top + 1, 4, 31, 1))
    .addRange(d.getRange(top + 1, 8, 31, 1))
    .setNumHeaders(1)
    .setOption('title', 'Sent and replies per day')
    .setOption('titleTextStyle', { color: T.strong, fontName: T.head, fontSize: 14, bold: true })
    .setOption('colors', [T.strong, T.gold])
    .setOption('backgroundColor', T.ivory)
    .setOption('legend', { position: 'bottom', textStyle: { color: T.muted, fontName: T.body } })
    .setOption('hAxis', { textStyle: { color: T.muted, fontName: T.body } })
    .setOption('vAxis', { textStyle: { color: T.muted, fontName: T.body }, gridlines: { color: T.line } })
    .setOption('width', 1170).setOption('height', 300)
    .setPosition(chartRow, 2, 0, 0)
    .build();
  d.insertChart(chart);

  dashFooter_(d, T, followUpPanel_(ctx, chartRow + 16));
}

// The credit strip at the bottom of every Dashboard layout. Rows after it are removed.
// "Follow-ups" section, drawn on every layout just above the footer. Returns the footer's new row.
function followUpPanel_(c, row) {
  var d = c.d, T = c.T;
  var need = row + 18;
  if (d.getMaxRows() < need) {
    var have = d.getMaxRows();
    d.insertRowsAfter(have, need - have);
    d.getRange(have + 1, 1, need - have, d.getMaxColumns()).setBackground(T.ivory).setFontFamily(T.body)
      .setFontSize(10).setFontColor(T.ink).setVerticalAlignment('middle');
  }
  c.section(row, 'Follow-ups');
  c.cardRow(row + 1, [
    { label: 'Follow-ups sent today', value: '={fuToday}', sub: '="All time: "&TEXT({fuAll},"#,##0")', dark: true },
    { label: 'Due today', value: '={fuDue}', sub: '="Next 3 days: "&TEXT({fuNext3},"#,##0")' },
    { label: 'Overdue (over 1 day)', value: '={fuOverdue}', sub: '=IF({fuOverdue}=0,"All on time","Check that Gmail on Inboxes")' },
    { label: 'Replies after a follow-up', value: '={fuReplies}', sub: '=TEXT(IFERROR({fuReplies}/{replyAll},0),"0%")&" of all replies"',
      bar: c.bar('{fuReplies}/{replyAll}') }
  ]);
  c.cardRow(row + 7, [
    { label: 'Follow-up 1 sent', value: '={fu1All}', sub: '="Follow-up 2 sent: "&TEXT({fu2All},"#,##0")' },
    { label: 'Follow-up reply rate', value: '=IFERROR({fuReplies}/{fu1All},0)', fmt: c.pct, sub: '="Replies per lead followed up"' },
    { label: 'Waiting for a follow-up', value: '={inSeq}', sub: '="Leads in sequence"' },
    { label: 'Finished all emails', value: '={completed}', sub: '="No reply after the last email"' }
  ]);
  return row + 14;
}

function dashFooter_(d, T, foot) {
  d.setRowHeight(foot - 1, 18);
  d.setRowHeight(foot, 36);
  d.getRange(foot, 2, 1, 15).setBackground(T.navy)
    .setBorder(true, null, null, null, null, null, T.gold, SpreadsheetApp.BorderStyle.SOLID_THICK);
  d.getRange(foot, 2, 1, 7).merge().setValue('  ' + BRAND.name.toUpperCase() + '   ·   ' + CORE_VERSION)
    .setFontColor(T.gold2).setFontSize(8).setFontWeight('bold');
  d.getRange(foot, 10, 1, 7).merge().setValue(BRAND.credit + '  ').setFontFamily(T.head).setFontStyle('italic')
    .setFontSize(11).setFontColor(T.gold2).setHorizontalAlignment('right');
  if (d.getMaxRows() > foot + 2) d.deleteRows(foot + 3, d.getMaxRows() - foot - 2);
}

// ---------------------------------------------------------------- dashboard layouts

var LAYOUT_INFO = {
  'Classic':       'Goal tracker, 16 cards, status and angle panels, day-by-day table and chart.',
  'Executive':     'One big hero number with a goal ring, 4 key tiles and a large trend chart.',
  'Scoreboard':    'Stadium style: giant numbers, TODAY against ALL TIME, with the goal on top.',
  'Funnel':        'Your pipeline as a funnel, from leads to meetings, with the % kept at each step.',
  'Inbox Command': 'One row per Gmail: sent today against its limit, health, waiting leads, totals.',
  'Compact':       'Everything on one screen: 8 small tiles, each with a 14-day trend.'
};
var LAYOUT_NAMES = Object.keys(LAYOUT_INFO);

function layoutFor_(ss) {
  var want = '';
  try { want = normHeader_(readSettings_(ss).layout); } catch (e) { /* default */ }
  return LAYOUT_NAMES.filter(function (n) { return want && normHeader_(n).indexOf(want) === 0; })[0] || 'Classic';
}

// Hidden helper area (columns T-W, rows 1-31): a day-by-day series for the charts. It sits at the
// top so the footer, which removes the rows below it, never removes it.
function dashSeries_(c) {
  var d = c.d, X = c.X, r0 = 1;
  d.getRange(r0, 20, 1, 4).setValues([['Date', 'Sent', 'Replies', 'Bounces']]);
  var rows = [];
  for (var n = 0; n < 30; n++) {
    var r = r0 + 1 + n;
    var day = function (ev) {
      return 'COUNTIFS(Log!$D:$D,"' + ev + '",Log!$A:$A,">="&$T' + r + ',Log!$A:$A,"<"&($T' + r + '+1))';
    };
    rows.push([X('=IF(' + n + '<{length},{start}+' + n + ',"")'),
      '=IF($T' + r + '="","",' + day('SENT*') + ')',
      '=IF($T' + r + '="","",' + day('REPLY') + '+' + day('UNSUB') + ')',
      '=IF($T' + r + '="","",' + day('BOUNCE') + ')']);
  }
  d.getRange(r0 + 1, 20, 30, 4).setFormulas(rows);
  d.getRange(r0 + 1, 20, 30, 1).setNumberFormat('d mmm');
  return { header: r0, first: r0 + 1, rows: 30 };
}

// A 14-day mini chart inside one cell, for an event like "SENT*".
function dashTrend_(T, evs, colour) {
  var part = function (ev) {
    return 'COUNTIFS(Log!$D:$D,"' + ev + '",Log!$A:$A,">="&(TODAY()-14+SEQUENCE(14)),Log!$A:$A,"<"&(TODAY()-13+SEQUENCE(14)))';
  };
  return '=SPARKLINE(ARRAYFORMULA(' + evs.map(part).join('+') + '),{"charttype","column";"color","' + (colour || T.gold) + '"})';
}

function dashChart_(c, title, type, ranges, row, width, height, colors, extra) {
  var b = c.d.newChart();
  b = type === 'pie' ? b.asPieChart() : type === 'line' ? b.asLineChart() : b.asColumnChart();
  ranges.forEach(function (r) { b.addRange(r); });
  b.setNumHeaders(1)
    .setOption('title', title)
    .setOption('titleTextStyle', { color: c.T.strong, fontName: c.T.head, fontSize: 14, bold: true })
    .setOption('colors', colors).setOption('backgroundColor', '#FFFFFF')
    .setOption('legend', { position: type === 'pie' ? 'none' : 'bottom', textStyle: { color: c.T.muted, fontName: c.T.body } })
    .setOption('hAxis', { textStyle: { color: c.T.muted, fontName: c.T.body } })
    .setOption('vAxis', { textStyle: { color: c.T.muted, fontName: c.T.body }, gridlines: { color: c.T.line } })
    .setOption('width', width).setOption('height', height)
    .setPosition(row, extra && extra.col || 2, 0, 0);
  try { b.setHiddenDimensionStrategy(Charts.ChartHiddenDimensionStrategy.SHOW_BOTH); } catch (e) { /* older Sheets */ }
  if (extra && extra.options) Object.keys(extra.options).forEach(function (k) { b.setOption(k, extra.options[k]); });
  c.d.insertChart(b.build());
}

function dashBox_(c, row, col, rows, cols, bg) {
  var r = c.d.getRange(row, col, rows, cols);
  r.setBackground(bg || '#FFFFFF').setBorder(true, true, true, true, null, null, c.T.line, SpreadsheetApp.BorderStyle.SOLID);
  c.d.getRange(row, col, 1, cols).setBorder(true, null, null, null, null, null, c.T.gold, SpreadsheetApp.BorderStyle.SOLID_THICK);
  return r;
}

function goalStatus_(X) {
  return X('=IF({delivered}>={goal},"🏆 Goal reached",IF({delivered}>={expected},"✅ On track: ahead by "&TEXT({delivered}-{expected},"#,##0"),' +
    '"⚠️ Behind by "&TEXT({expected}-{delivered},"#,##0")&": need "&TEXT({needed},"#,##0")&" a day"))');
}

function goalBar_(c) {
  return c.X('=SPARKLINE({MIN({goal},{delivered}),MAX(0,MIN({goal},{expected})-{delivered})},' +
    '{"charttype","bar";"max",MAX(1,{goal});"color1","' + c.T.gold + '";"color2","' + c.T.paleGold + '"})');
}

var DASH_LAYOUTS_ = {

  // One big hero number with a goal ring, 4 key tiles and a large trend chart.
  'Executive': function (c) {
    var d = c.d, T = c.T, X = c.X;
    var s = dashSeries_(c);
    c.section(7, 'Campaign at a glance');
    var h = 8;
    [[h, 30], [h + 1, 70], [h + 2, 26], [h + 3, 30], [h + 4, 26], [h + 5, 30], [h + 6, 14]].forEach(function (x) { d.setRowHeight(x[0], x[1]); });
    dashBox_(c, h, 2, 6, 7).setHorizontalAlignment('center');
    d.getRange(h, 2, 1, 7).merge().setValue('DELIVERED').setFontSize(9).setFontWeight('bold').setFontColor(T.muted).setVerticalAlignment('bottom');
    d.getRange(h + 1, 2, 1, 7).merge().setFormula(X('={delivered}')).setNumberFormat(c.num)
      .setFontFamily(T.head).setFontSize(54).setFontWeight('bold').setFontColor(T.strong);
    d.getRange(h + 2, 2, 1, 7).merge().setFormula(X('="of "&TEXT({goal},"#,##0")&" goal   ·   "&TEXT({progress},"0.0%")&"   ·   "&TEXT({toGo},"#,##0")&" to go"'))
      .setFontSize(11).setFontColor(T.muted);
    d.getRange(h + 3, 2, 1, 7).merge().setFormula(goalStatus_(X)).setFontSize(11).setFontWeight('bold');
    d.getRange(h + 4, 2, 1, 7).merge().setFormula(goalBar_(c)).setBackground(T.track);
    d.getRange(h + 5, 2, 1, 7).merge().setFormula(X('="Day "&{dayNum}&" of "&{length}&"   ·   need "&TEXT({needed},"#,##0")&" a day"'))
      .setFontSize(9).setFontColor(T.muted);
    d.getRange(38, 18, 3, 2).setValues([['Part', 'Count'], ['Delivered', ''], ['To go', '']]);
    d.getRange(39, 19, 2, 1).setFormulas([[X('={delivered}')], [X('={toGo}')]]);
    dashChart_(c, 'Goal', 'pie', [d.getRange(38, 18, 3, 2)], h, 560, 236, [T.gold, T.track],
      { col: 10, options: { pieHole: 0.62, pieSliceText: 'none' } });
    c.cardRow(h + 8, [
      { label: 'Sent today', value: '={sentToday}', sub: '="Needed per day: "&TEXT({needed},"#,##0")', bar: c.bar('{sentToday}/{needed}') },
      { label: 'Replies today', value: '={replyToday}', sub: '="Replies in total: "&TEXT({replyAll},"#,##0")' },
      { label: 'Reply rate', value: '={replyRate}', fmt: c.pct, sub: '=TEXT({replyAll},"#,##0")&" replies"', bar: c.bar('{replyRate}/0.1') },
      { label: 'Bounce rate', value: '={bounceRate}', fmt: c.pct, sub: '="Keep under 2%"',
        bar: c.bar('{bounceRate}/0.05', 'IF({bounceRate}>=0.02,"' + T.bad + '","' + T.good + '")') }
    ]);
    c.section(h + 15, 'Trend');
    dashChart_(c, 'Sent and replies per day', 'column', [d.getRange(s.header, 20, s.rows + 1, 3)],
      h + 16, 1170, 320, [T.strong, T.gold]);
    return h + 34;
  },

  // Stadium style: giant numbers, TODAY against ALL TIME, with the goal on top.
  'Scoreboard': function (c) {
    var d = c.d, T = c.T, X = c.X;
    var top = 7;
    d.getRange(top, 2, 15, 15).setBackground(T.navy);
    d.setRowHeight(top, 34);
    d.getRange(top, 2, 1, 7).merge().setValue('  GOAL').setFontFamily(T.head).setFontSize(14).setFontWeight('bold').setFontColor(T.gold2);
    d.getRange(top, 10, 1, 7).merge().setFormula(goalStatus_(X)).setHorizontalAlignment('right').setFontWeight('bold').setFontColor(T.onNavy);
    d.setRowHeight(top + 1, 30);
    d.getRange(top + 1, 2, 1, 15).merge().setFormula(goalBar_(c)).setBackground(T.darkTrack);
    d.setRowHeight(top + 2, 30);
    d.getRange(top + 2, 2, 1, 15).merge().setHorizontalAlignment('center').setFontFamily(T.head).setFontSize(14).setFontColor(T.onNavy)
      .setFormula(X('=TEXT({delivered},"#,##0")&" of "&TEXT({goal},"#,##0")&" delivered   ·   "&TEXT({progress},"0.0%")&"   ·   day "&{dayNum}&" of "&{length}'));
    var hr = top + 4;
    d.setRowHeight(hr - 1, 14);
    d.setRowHeight(hr, 34);
    [[2, 3, ''], [6, 3, 'TODAY'], [10, 3, 'ALL TIME'], [14, 3, 'RATE']].forEach(function (x) {
      d.getRange(hr, x[0], 1, x[1]).merge().setValue(x[2]).setHorizontalAlignment('center').setFontSize(11)
        .setFontWeight('bold').setFontColor(T.gold2);
    });
    d.getRange(hr, 2, 1, 15).setBorder(null, null, true, null, null, null, T.gold, SpreadsheetApp.BorderStyle.SOLID_THICK);
    var lines = [
      ['EMAILS SENT', '={sentToday}', '={sentAll}', '="Need "&TEXT({needed},"#,##0")&"/day"'],
      ['REPLIES', '={replyToday}', '={replyAll}', '=TEXT({replyRate},"0.0%")&" reply rate"'],
      ['BOUNCES', '={bounceToday}', '={bounceAll}', '=TEXT({bounceRate},"0.0%")&" bounce rate"'],
      ['NEW PEOPLE', '={firstToday}', '={firstAll}', '="of "&TEXT({leads},"#,##0")&" leads"'],
      ['MEETINGS', '="–"', '={meetings}', '=TEXT({interested},"#,##0")&" interested"']
    ];
    lines.forEach(function (l, i) {
      var r = hr + 1 + i * 2;
      d.setRowHeight(r, 64); d.setRowHeight(r + 1, 6);
      d.getRange(r, 2, 1, 15).setBackground(i % 2 ? T.navy : T.navy2);
      d.getRange(r, 2, 1, 3).merge().setValue('  ' + l[0]).setFontWeight('bold').setFontSize(12).setFontColor(T.onNavy);
      d.getRange(r, 6, 1, 3).merge().setFormula(X(l[1])).setNumberFormat(c.num).setHorizontalAlignment('center')
        .setFontFamily(T.head).setFontSize(40).setFontWeight('bold').setFontColor(T.gold2);
      d.getRange(r, 10, 1, 3).merge().setFormula(X(l[2])).setNumberFormat(c.num).setHorizontalAlignment('center')
        .setFontFamily(T.head).setFontSize(40).setFontWeight('bold').setFontColor(T.onNavy);
      d.getRange(r, 14, 1, 3).merge().setFormula(X(l[3])).setHorizontalAlignment('center').setFontSize(11).setFontColor(T.soft);
    });
    return hr + 13;
  },

  // Your pipeline as a funnel, from leads to meetings.
  'Funnel': function (c) {
    var d = c.d, T = c.T, X = c.X;
    c.section(7, 'Your funnel');
    var steps = [
      ['Leads', 'In your sheet', '={leads}'],
      ['Contacted', 'Got the first email', '={firstAll}'],
      ['Reached', 'Contacted and did not bounce', '=MAX(0,{firstAll}-{bounceAll})'],
      ['Replied', 'Answered (incl. unsubscribes)', '={replyAll}'],
      ['Interested', 'Interested, meetings or customers', '={interested}+{meetings}+{customers}'],
      ['Meetings', 'Meetings booked', '={meetings}']
    ];
    var shades = [T.strong, T.strong, T.gold, T.gold, T.good, T.good];
    var r0 = 8;
    d.setRowHeight(r0, 24);
    [[2, 3, 'STEP'], [6, 7, 'HOW MANY OF YOUR LEADS'], [14, 1, 'COUNT'], [15, 2, 'KEPT FROM STEP BEFORE']].forEach(function (x) {
      d.getRange(r0, x[0], 1, x[1]).merge().setValue(x[2]).setFontSize(8).setFontWeight('bold').setFontColor(T.muted).setHorizontalAlignment('center');
    });
    steps.forEach(function (st, i) {
      var r = r0 + 1 + i;
      d.setRowHeight(r, 48);
      d.getRange(r, 2, 1, 15).setBackground(i % 2 ? T.ivory : '#FFFFFF');
      d.getRange(r, 2, 1, 3).merge().setValue(st[0] + '\n' + st[1]).setFontSize(10).setFontColor(T.strong).setFontWeight('bold').setWrap(true);
      d.getRange(r, 14).setFormula(X(st[2])).setNumberFormat(c.num).setHorizontalAlignment('center')
        .setFontFamily(T.head).setFontSize(18).setFontWeight('bold').setFontColor(T.strong);
      d.getRange(r, 6, 1, 7).merge().setFormula(X('=IF({leads}=0,"",SPARKLINE(N' + r + '/{leads},{"charttype","bar";"max",1;"color1","' + shades[i] + '"}))'))
        .setBackground(T.track);
      d.getRange(r, 15, 1, 2).merge().setFormula(i ? '=IFERROR(TEXT(N' + r + '/N' + (r - 1) + ',"0%"),"–")' : '="100%"')
        .setHorizontalAlignment('center').setFontSize(13).setFontWeight('bold').setFontColor(T.gold);
    });
    d.getRange(r0, 2, steps.length + 1, 15).setBorder(true, true, true, true, null, null, T.line, SpreadsheetApp.BorderStyle.SOLID);
    var t = r0 + steps.length + 2;
    c.section(t, 'Today');
    c.cardRow(t + 1, [
      { label: 'Sent today', value: '={sentToday}', sub: '="Needed per day: "&TEXT({needed},"#,##0")', bar: c.bar('{sentToday}/{needed}') },
      { label: 'New people today', value: '={firstToday}', sub: '="Follow-ups: "&TEXT({fuToday},"#,##0")' },
      { label: 'Replies today', value: '={replyToday}', sub: '="In total: "&TEXT({replyAll},"#,##0")' },
      { label: 'Goal', value: '={progress}', fmt: c.pct, sub: '=TEXT({delivered},"#,##0")&" of "&TEXT({goal},"#,##0")', bar: c.bar('{progress}') }
    ]);
    return t + 9;
  },

  // One row per Gmail: sent today against its limit, health, waiting leads, totals.
  'Inbox Command': function (c) {
    var d = c.d, T = c.T, X = c.X, It = c.It;
    c.section(7, 'Today');
    c.cardRow(8, [
      { label: 'Sent today', value: '={sentToday}', sub: '="Capacity: "&TEXT({capacity},"#,##0")&" a day"', bar: c.bar('{sentToday}/{capacity}') },
      { label: 'Active Gmails', value: '={activeInboxes}&" of "&{inboxes}', sub: '="Paused: "&({inboxes}-{activeInboxes})' },
      { label: 'Leads waiting', value: '={waiting}', sub: '="In sequence: "&TEXT({inSeq},"#,##0")' },
      { label: 'Bounces today', value: '={bounceToday}', sub: '="Bounce rate today: "&TEXT({bounceRateToday},"0.0%")' }
    ]);
    c.section(15, 'Your Gmails');
    var hr = 16;
    d.setRowHeight(hr, 26);
    var cols = [[2, 3, 'GMAIL'], [6, 1, 'STATUS'], [7, 1, 'SENT TODAY'], [8, 1, 'LIMIT'], [10, 3, 'TODAY’S PROGRESS'],
                [14, 1, 'HEALTH'], [15, 1, 'WAITING'], [16, 1, 'TOTAL SENT']];
    d.getRange(hr, 2, 1, 15).setBackground(T.navy);
    cols.forEach(function (x) {
      d.getRange(hr, x[0], 1, x[1]).merge().setValue(x[2]).setFontSize(8).setFontWeight('bold').setFontColor(T.onNavy).setHorizontalAlignment('center');
    });
    var ref = function (h, r) { return 'Inboxes!$' + It[h] + '$' + r; };
    var N = 20;
    for (var i = 0; i < N; i++) {
      var r = hr + 1 + i, src = i + 2, e = ref('Inbox Email', src);
      d.setRowHeight(r, 26);
      d.getRange(r, 2, 1, 15).setBackground(i % 2 ? T.ivory : '#FFFFFF');
      var lim = 'IF(' + ref('Daily Limit', src) + '="",' + c.V('Default daily limit per inbox') + ',' + ref('Daily Limit', src) + ')';
      d.getRange(r, 2, 1, 3).merge().setFormula('=IF(' + e + '="","",' + e + ')').setFontWeight('bold').setFontColor(T.strong);
      d.getRange(r, 6, 1, 3).setFormulas([['=IF(' + e + '="","",' + ref('Status', src) + ')',
        '=IF(' + e + '="","",' + ref('Sent Today', src) + ')', '=IF(' + e + '="","",' + lim + ')']]).setHorizontalAlignment('center');
      d.getRange(r, 10, 1, 3).merge().setFormula('=IF(' + e + '="","",SPARKLINE(MIN(1,IFERROR(G' + r + '/H' + r + ',0)),{"charttype","bar";"max",1;"color1","' + T.gold + '"}))')
        .setBackground(T.track);
      d.getRange(r, 14, 1, 3).setFormulas([['=IF(' + e + '="","",' + ref('Health', src) + ')',
        '=IF(' + e + '="","",' + ref('Leads Waiting', src) + ')', '=IF(' + e + '="","",' + ref('Total Sent', src) + ')']])
        .setHorizontalAlignment('center');
    }
    d.getRange(hr, 2, N + 1, 15).setBorder(true, true, true, true, null, null, T.line, SpreadsheetApp.BorderStyle.SOLID);
    return hr + N + 3;
  },

  // Everything on one screen: 8 small tiles, each with a 14-day trend.
  'Compact': function (c) {
    var d = c.d, T = c.T, X = c.X;
    var COLS4 = [2, 6, 10, 14];
    var tiles = [
      ['Sent today', '={sentToday}', c.num, dashTrend_(T, ['SENT*']), '="Need "&TEXT({needed},"#,##0")&" a day"'],
      ['Replies today', '={replyToday}', c.num, dashTrend_(T, ['REPLY', 'UNSUB']), '="Total "&TEXT({replyAll},"#,##0")'],
      ['Bounces today', '={bounceToday}', c.num, dashTrend_(T, ['BOUNCE'], T.bad), '="Rate "&TEXT({bounceRate},"0.0%")'],
      ['New people today', '={firstToday}', c.num, dashTrend_(T, ['SENT_1']), '="Total "&TEXT({firstAll},"#,##0")'],
      ['Delivered', '={delivered}', c.num, c.bar('{progress}'), '="of "&TEXT({goal},"#,##0")&" · "&TEXT({progress},"0%")'],
      ['Reply rate', '={replyRate}', c.pct, c.bar('{replyRate}/0.1'), '="Meetings "&TEXT({meetings},"#,##0")'],
      ['Leads waiting', '={waiting}', c.num, c.bar('{waiting}/MAX(1,{leads})'), '="of "&TEXT({leads},"#,##0")&" leads"'],
      ['Active Gmails', '={activeInboxes}&" of "&{inboxes}', c.num, c.bar('{activeInboxes}/MAX(1,{inboxes})'), '="Day "&{dayNum}&" of "&{length}']
    ];
    [7, 13].forEach(function (row, k) {
      [[0, 20], [1, 34], [2, 30], [3, 18], [4, 10]].forEach(function (x) { d.setRowHeight(row + x[0], x[1]); });
      tiles.slice(k * 4, k * 4 + 4).forEach(function (t, i) {
        var col = COLS4[i];
        dashBox_(c, row, col, 4, 3).setHorizontalAlignment('center');
        d.getRange(row, col, 1, 3).merge().setValue(t[0].toUpperCase()).setFontSize(8).setFontWeight('bold').setFontColor(T.muted);
        d.getRange(row + 1, col, 1, 3).merge().setFormula(X(t[1])).setNumberFormat(t[2])
          .setFontFamily(T.head).setFontSize(20).setFontWeight('bold').setFontColor(T.strong);
        d.getRange(row + 2, col, 1, 3).merge().setFormula(X(t[3])).setBackground(k ? T.track : '#FFFFFF');
        d.getRange(row + 3, col, 1, 3).merge().setFormula(X(t[4])).setFontSize(8).setFontColor(T.muted);
      });
    });
    d.setRowHeight(18, 14);
    d.setRowHeight(19, 30);
    d.getRange(19, 2, 1, 15).merge().setBackground('#FFFFFF').setHorizontalAlignment('center').setFontSize(10).setFontColor(T.strong)
      .setBorder(true, true, true, true, null, null, T.line, SpreadsheetApp.BorderStyle.SOLID)
      .setFormula('=TEXTJOIN("   ·   ",TRUE,' + STATUS_LIST.map(function (s) {
        return '"' + s + ' "&COUNTIF(' + c.LC('Status') + ',"' + s + '")';
      }).join(',') + ')');
    d.setRowHeight(20, 22);
    d.getRange(20, 2, 1, 15).merge().setHorizontalAlignment('center').setFontSize(8).setFontColor(T.muted)
      .setValue('Small charts show the last 14 days.');
    return 23;
  }
};

// Outreach -> Choose dashboard layout (loader slot 4): a window with a preview of every layout.
function slot4() {
  askAllPermissions_();
  var ss = ss_();
  loadTheme_(ss);
  var current = layoutFor_(ss);
  var html = HtmlService.createHtmlOutput(layoutChooserHtml_(THEME, current)).setWidth(900).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'Choose a dashboard layout');
}

// Called by the chooser window (loader slot 5): saves the layout and rebuilds the Dashboard.
function slot5(name) {
  var ss = ss_();
  if (LAYOUT_NAMES.indexOf(name) < 0) throw new Error('Unknown layout: ' + name);
  var st = ss.getSheetByName(SHEET.SETTINGS);
  var vals = st.getRange(1, 1, st.getLastRow(), 1).getValues();
  var row = -1;
  vals.forEach(function (v, i) { if (row < 0 && String(v[0]).trim() === 'Dashboard layout') row = i + 1; });
  if (row < 0) { st.appendRow(['Dashboard layout', name, SETTINGS_DEF.filter(function (x) { return x.key === 'layout'; })[0].note]); }
  else { st.getRange(row, 2).clearDataValidations().setValue(name); }
  loadTheme_(ss);
  buildDashboard_(ss);
  try { addGuards_(ss); } catch (e) { /* guards are a nice-to-have */ }
  ss.setActiveSheet(ss.getSheetByName(SHEET.DASH));
  return 'Dashboard layout: ' + name;
}

// The chooser window: mini previews drawn in the sheet's colours.
function layoutChooserHtml_(T, current) {
  var bg = T.ivory, band = T.navy, acc = T.gold, card = '#FFFFFF', line = T.line, txt = T.strong;
  var b = function (w, h, c, extra) { return '<i style="display:block;width:' + w + ';height:' + h + 'px;background:' + c + ';' + (extra || '') + '"></i>'; };
  var row = function (inner, gap) { return '<div style="display:flex;gap:' + (gap || 4) + 'px;margin-top:5px">' + inner + '</div>'; };
  var tile = function (dark) { return '<div style="flex:1;background:' + (dark ? band : card) + ';border:1px solid ' + line + ';border-top:2px solid ' + acc + ';height:22px;padding:3px"><i style="display:block;width:60%;height:6px;margin:3px auto;background:' + (dark ? T.gold2 : txt) + '"></i>' + b('100%', 3, acc) + '</div>'; };
  var tiles = function (n, dark1) { var s = ''; for (var i = 0; i < n; i++) s += tile(dark1 && !i); return row(s); };
  var bars = function (ws, cols) { return ws.map(function (w, i) { return row(b('28px', 8, line) + b(w + '%', 8, cols ? cols[i] : acc)); }).join(''); };
  var p = {
    'Classic': row(b('100%', 12, card, 'border-top:2px solid ' + acc)) + tiles(4, false) + tiles(4, true) + row(b('48%', 30, card, 'border:1px solid ' + line) + b('48%', 30, card, 'border:1px solid ' + line)),
    'Executive': row('<div style="flex:1;background:' + card + ';border:1px solid ' + line + ';border-top:2px solid ' + acc + ';height:46px;text-align:center"><i style="display:block;width:50%;height:16px;margin:8px auto 4px;background:' + txt + '"></i>' + b('80%', 4, acc, 'margin:0 auto') + '</div><div style="width:46px;height:46px;border-radius:50%;border:9px solid ' + acc + ';border-left-color:' + line + ';box-sizing:border-box"></div>') + tiles(4, false) + row(b('100%', 26, card, 'border:1px solid ' + line + ';background:linear-gradient(to top,' + acc + ' 0 40%,' + card + ' 40%)')),
    'Scoreboard': '<div style="background:' + band + ';padding:4px">' + row(b('100%', 6, acc)) + ['', '', '', ''].map(function () { return row(b('28%', 10, T.soft) + b('30%', 14, T.gold2) + b('30%', 14, T.onNavy), 6); }).join('') + '</div>',
    'Funnel': bars([100, 80, 62, 30, 16, 8], [txt, txt, acc, acc, T.good, T.good]) + tiles(4, false),
    'Inbox Command': tiles(4, false) + row(b('100%', 8, band)) + ['', '', '', '', ''].map(function () { return row(b('30%', 6, txt) + b('16%', 6, line) + b('30%', 6, acc) + b('14%', 6, T.good)); }).join(''),
    'Compact': tiles(4, false) + row(['', '', '', ''].map(function () { return '<div style="flex:1;background:' + card + ';border:1px solid ' + line + ';height:26px;display:flex;align-items:flex-end;gap:1px;padding:2px">' + [4, 8, 5, 10, 7, 12, 9, 14].map(function (h) { return '<i style="flex:1;height:' + h + 'px;background:' + acc + '"></i>'; }).join('') + '</div>'; }).join('')) + row(b('100%', 8, line))
  };
  var cards = LAYOUT_NAMES.map(function (n) {
    return '<label class="opt' + (n === current ? ' on' : '') + '"><input type="radio" name="l" value="' + n + '"' + (n === current ? ' checked' : '') + '>' +
      '<div class="pv" style="background:' + bg + '"><div style="background:' + band + ';height:14px;border-bottom:2px solid ' + acc + '"></div><div style="padding:4px 6px">' + p[n] + '</div></div>' +
      '<b>' + n + (n === current ? ' <span>(now)</span>' : '') + '</b><small>' + LAYOUT_INFO[n] + '</small></label>';
  }).join('');
  return '<style>body{font-family:Arial,sans-serif;margin:0;padding:6px 10px;color:#1D2333}' +
    '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}' +
    '.opt{display:block;border:2px solid #E3E3E3;border-radius:8px;padding:8px;cursor:pointer}.opt.on{border-color:' + acc + '}' +
    '.opt input{display:none}.opt b{display:block;margin-top:8px;font-size:14px}.opt b span{color:#888;font-weight:normal;font-size:12px}' +
    '.opt small{display:block;color:#666;font-size:11px;line-height:1.35;margin-top:3px;min-height:30px}' +
    '.pv{height:130px;border:1px solid #ddd;overflow:hidden}' +
    '.btn{background:' + band + ';color:' + T.onNavy + ';border:2px solid ' + acc + ';border-radius:4px;padding:10px 22px;font-size:14px;font-weight:bold;cursor:pointer}' +
    '#msg{margin-left:12px;color:#444}</style>' +
    '<div class="grid">' + cards + '</div>' +
    '<p style="margin-top:16px"><button class="btn" id="go" onclick="go()">Use this layout</button><span id="msg">Your data and numbers stay the same. Only the look changes.</span></p>' +
    '<script>' +
    'document.querySelectorAll(".opt").forEach(function(o){o.addEventListener("click",function(){document.querySelectorAll(".opt").forEach(function(x){x.classList.remove("on")});o.classList.add("on");o.querySelector("input").checked=true;});});' +
    'function go(){var v=document.querySelector("input[name=l]:checked");if(!v)return;document.getElementById("go").disabled=true;document.getElementById("msg").textContent="Building the "+v.value+" layout... about 20 seconds.";' +
    'google.script.run.withSuccessHandler(function(){google.script.host.close();}).withFailureHandler(function(e){document.getElementById("go").disabled=false;document.getElementById("msg").textContent="Could not build it: "+(e&&e.message?e.message:e);}).slot5(v.value);}' +
    '</script>';
}

// Navy and gold header row, body font and alternating rows for a data tab.
function styleDataTab_(sh, opts) {
  opts = opts || {};
  var T = THEME;
  var width = Math.max(1, sh.getLastColumn());
  sh.getRange(1, 1, sh.getMaxRows(), width).setFontFamily(T.body).setFontSize(10);
  sh.getRange(1, 1, 1, width).setBackground(T.navy).setFontColor(T.onNavy).setFontWeight('bold')
    .setVerticalAlignment('middle')
    .setBorder(null, null, true, null, null, null, T.gold, SpreadsheetApp.BorderStyle.SOLID_THICK);
  sh.setRowHeight(1, 32);
  sh.getBandings().forEach(function (b) { b.remove(); });
  if (opts.banding !== false && sh.getMaxRows() > 1) {
    sh.getRange(2, 1, sh.getMaxRows() - 1, width)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
      .setFirstRowColor('#FFFFFF').setSecondRowColor(T.ivory);
  }
  if (opts.hideGrid) sh.setHiddenGridlines(true);
}

// Applies the theme to every tab (the Dashboard styles itself).
function styleTabs_(ss) {
  var T = THEME;
  [[SHEET.LEADS, {}], [SHEET.INBOXES, { hideGrid: true }], [SHEET.LOG, {}], [SHEET.DNC, {}],
   [TEAM.OVERVIEW, { hideGrid: true }], [TEAM.ALERTS, {}], [TEAM.HISTORY, {}]].forEach(function (t) {
    var sh = ss.getSheetByName(t[0]);
    if (sh) styleDataTab_(sh, t[1]);
  });
  var st = ss.getSheetByName(SHEET.SETTINGS);
  if (st) {
    styleDataTab_(st, { banding: false, hideGrid: true });
    var n = Math.max(2, st.getLastRow());
    st.getRange(2, 1, n - 1, 1).setFontWeight('bold').setFontColor(T.strong);
    st.getRange(2, 2, n - 1, 1).setBackground('#FFF9E6').setFontColor(T.ink)
      .setBorder(true, true, true, true, true, false, T.line, SpreadsheetApp.BorderStyle.SOLID);
    st.getRange(2, 3, n - 1, 1).setFontStyle('italic').setFontColor(T.muted).setFontSize(9);
    for (var r = 2; r <= n; r++) st.setRowHeight(r, 28);
  }
}

// ---------------------------------------------------------------- import: upload a lead file

// Opens a small window: pick a CSV file (or paste the text), choose a Gmail, check, import.
function showUploadDialog() {
  askAllPermissions_();
  var ss = ss_();
  if (!ss.getSheetByName(SHEET.LEADS)) return alert_('Run Outreach -> 1. Set up this sheet first.');
  var options = allInboxes_(ss).map(function (i) {
    return '<option value="' + i + '">' + i + '</option>';
  }).join('');
  loadTheme_(ss);
  var html = HtmlService.createHtmlOutput(UPLOAD_HTML_.replace('{{OPTIONS}}', options)
      .replace(/#0B1530/g, THEME.navy).replace(/#FBF8F1/g, THEME.ivory)
      .replace('color:#fff;font-size:18px', 'color:' + THEME.onNavy + ';font-size:18px')
      .replace(/#E8C766/g, THEME.gold2).replace(/#C9A227/g, THEME.gold)
      .replace('{{LOGO}}', LOGO_PNG_B64).replace('{{BRAND}}', BRAND.name).replace('{{CREDIT}}', BRAND.credit))
    .setWidth(680).setHeight(600);
  try {
    SpreadsheetApp.getUi().showModalDialog(html, 'Upload a lead file');
  } catch (e) {
    if (!/permission/i.test(e.message)) throw e;
    alert_('This sheet needs the newest Loader.gs before the upload window can open (one time only).\n\n' +
      '1. Extensions -> Apps Script.\n2. Replace everything with the new Loader.gs from your admin, and Save.\n' +
      '3. Choose updateNow in the dropdown, click Run, then Allow.\n4. Reload the sheet and try again.');
  }
}

// Called by the upload window: checks the files without importing anything.
// Takes one text, or a list of { name, text } for several files at once.
function previewLeadText(input) {
  if (Array.isArray(input)) {
    return { files: input.map(function (f) { var p = previewOne_(f.text); p.name = f.name; return p; }) };
  }
  return previewOne_(input);
}

function previewOne_(text) {
  var rows = leadRowsFromText_(text);
  if (rows.length < 2) {
    return { leads: 0, error: 'No leads found. The first line must be the column names, for example: Email,First Name,Company,...' };
  }
  return checkLeadRows_(rows);
}

// Called by the upload window: imports the leads and returns the summary text.
// Takes one text, or a list of { name, text } for several files at once.
function importLeadText(input, inbox, name) {
  var ss = ss_();
  inbox = normEmail_(inbox);
  if (inbox && allInboxes_(ss).indexOf(inbox) < 0) throw new Error(inbox + ' is not on the Inboxes tab.');
  var files = Array.isArray(input) ? input : [{ name: name, text: input }];
  var stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
  var out = [], total = 0;
  files.forEach(function (f, i) {
    var rows = leadRowsFromText_(f.text);
    var head = files.length > 1 ? 'FILE ' + (i + 1) + ' OF ' + files.length + ': ' + (f.name || 'Upload') + '\n' : '';
    if (rows.length < 2) { out.push(head + 'No leads found in this file (the first line must be the column names). Skipped.'); return; }
    var res = importRows_(ss, rows, (f.name || 'Upload') + ' ' + stamp, inbox);
    total += res.imported;
    out.push(head + importSummary_(res) + gapsText_(checkLeadRows_(rows)));
  });
  if (files.length > 1) out.unshift('TOTAL: ' + total + ' new leads from ' + files.length + ' files.');
  return out.join('\n\n────────────\n\n');
}

var UPLOAD_HTML_ = [
  '<style>',
  '@import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Montserrat:wght@400;600;700&display=swap");',
  'body{font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#1D2333;margin:0;padding:0 6px;background:#FBF8F1}',
  '.top{background:#0B1530;border-bottom:3px solid #C9A227;margin:0 -6px 6px;padding:10px 14px;display:flex;align-items:center;gap:12px}',
  '.top img{height:42px}.top b{font-family:"Playfair Display",serif;color:#fff;font-size:18px}',
  '.credit{margin:14px 0 4px;text-align:right;font-family:"Playfair Display",serif;font-style:italic;color:#9A7B1A;font-size:12px}',
  'h3{margin:14px 0 6px;font-size:14px;color:#0B1530;letter-spacing:.3px}',
  'textarea{width:100%;box-sizing:border-box;height:100px;font-family:monospace;font-size:12px}',
  'select{font-size:14px;padding:6px;max-width:100%}',
  '.btn{background:#0B1530;color:#E8C766;border:1px solid #C9A227;border-radius:3px;padding:9px 18px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}',
  '.btn:disabled{background:#6B7189;color:#eee}',
  '.ok{color:#188038;white-space:nowrap}.bad{color:#c5221f;font-weight:bold;white-space:normal}',
  '.box{border:1px solid #E7DFC9;border-top:3px solid #C9A227;padding:10px;margin-top:10px;background:#fff;white-space:pre-wrap}',
  '.hint{color:#666;margin:6px 0}',
  '</style>',
  '<div class="top"><img src="data:image/png;base64,{{LOGO}}"><b>{{BRAND}}</b></div>',
  '<h3>1. Choose your lead files (one or several)</h3>',
  '<input type="file" id="file" multiple accept=".csv,.tsv,.txt,text/csv">',
  '<div class="hint">Hold Ctrl (Windows) or Cmd (Mac) to pick several files at once.</div>',
  '<div class="hint">or paste the CSV text, or rows copied from a sheet (with the header row), here:</div>',
  '<textarea id="paste" placeholder="Email,First Name,Last Name,Company,Subject,Message,Follow-up 1,Follow-up 2,..."></textarea>',
  '<h3>2. Which Gmail sends them?</h3>',
  '<select id="inbox"><option value="">Spread evenly across all Gmails</option>{{OPTIONS}}</select>',
  '<div class="hint">A Send From column in the file wins over this choice.</div>',
  '<p><button class="btn" id="check" onclick="check()">Check files</button></p>',
  '<div id="out"></div>',
  '<div class="credit">{{CREDIT}}</div>',
  '<script>',
  'var files = [];',
  'document.getElementById("file").addEventListener("change", function (e) {',
  '  var list = Array.prototype.slice.call(e.target.files || []);',
  '  var excel = list.filter(function (f) { return /\\.xlsx?$/i.test(f.name); });',
  '  list = list.filter(function (f) { return !/\\.xlsx?$/i.test(f.name); });',
  '  files = []; if (!list.length && !excel.length) return;',
  '  var left = list.length;',
  '  var done = function () {',
  '    var h = "<p>Loaded " + files.length + " file" + (files.length === 1 ? "" : "s") + ": " + files.map(function (f) { return esc(f.name); }).join(", ") + ". Click Check files.</p>";',
  '    if (excel.length) h += "<p class=bad>Skipped Excel files (" + excel.map(function (f) { return esc(f.name); }).join(", ") + "). Open them in Google Sheets, then File, Download, CSV.</p>";',
  '    show(h);',
  '  };',
  '  if (!left) { done(); return; }',
  '  list.forEach(function (f) {',
  '    var r = new FileReader();',
  '    r.onload = function () { files.push({ name: f.name, text: r.result }); left--; if (!left) { document.getElementById("paste").value = ""; done(); } };',
  '    r.readAsText(f);',
  '  });',
  '});',
  'function current() { var p = document.getElementById("paste").value; return p.trim() ? [{ name: "Pasted leads", text: p }] : files; }',
  'function check() {',
  '  var c = current(); if (!c.length) { show("<p class=bad>Choose your files or paste your leads first.</p>"); return; }',
  '  busy(true, "Checking..."); google.script.run.withSuccessHandler(function (p) { busy(false); preview(p.files); }).withFailureHandler(fail).previewLeadText(c);',
  '}',
  'function preview(list) {',
  '  var total = 0, missing = false, h = "";',
  '  list.forEach(function (p) {',
  '    h += "<div class=box><b>" + esc(p.name) + "</b>\\n";',
  '    if (!p.leads) { h += "<span class=bad>" + esc(p.error || "No leads with an email were found.") + "</span></div>"; return; }',
  '    total += p.leads;',
  '    h += p.leads + " leads found.\\n";',
  '    p.columns.forEach(function (c) { h += (c.ok ? "<span class=ok>&#10004; " : "<span class=bad>&#10008; ") + esc(c.label) + "</span>   "; });',
  '    if (p.gaps.length) h += "\\nEmpty cells: " + p.gaps.map(function (g) { return esc(g.label) + " (" + g.count + ")"; }).join(", ");',
  '    if (p.noEmail) h += "\\n" + p.noEmail + " rows have no email and will be skipped.";',
  '    if (p.sample) h += "\\nFirst lead: " + esc(p.sample);',
  '    if (p.missing.length) { missing = true; h += "\\n<span class=bad>Missing columns: " + esc(p.missing.join(", ")) + "</span>"; }',
  '    h += "</div>";',
  '  });',
  '  if (!total) { show(h); return; }',
  '  var label = "Import " + total + " leads" + (list.length > 1 ? " from " + list.length + " files" : "");',
  '  if (missing) h += "<p class=bad>Some files are missing columns. Best fix: make them again with the lead prompt (LEAD-PROMPT.txt).</p><p><button class=btn onclick=go()>Import anyway</button></p>";',
  '  else h += "<p><button class=btn onclick=go()>" + label + "</button></p>";',
  '  show(h);',
  '}',
  'function go() {',
  '  var c = current(); busy(true, "Importing... this can take a minute.");',
  '  google.script.run.withSuccessHandler(function (msg) { busy(false); show("<div class=box>" + esc(msg) + "</div><p><button class=btn onclick=google.script.host.close()>Close</button></p>"); })',
  '    .withFailureHandler(fail).importLeadText(c, document.getElementById("inbox").value);',
  '}',
  'function fail(e) { busy(false); show("<p class=bad>" + esc(e && e.message ? e.message : e) + "</p>"); }',
  'function busy(b, m) { document.getElementById("check").disabled = b; if (b) show("<p>" + m + "</p>"); }',
  'function show(h) { document.getElementById("out").innerHTML = h; }',
  'function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;" }[c]; }); }',
  '</script>'
].join('\n');

// ---------------------------------------------------------------- reading lead files

// Turns CSV or tab-separated text into rows. Handles text copied from an AI chat
// (```csv fences, a sentence before the header) and rows copied from a sheet.
function parseCsvText_(text) {
  var t = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  t = t.split('\n').filter(function (l) { return !/^\s*```/.test(l); }).join('\n');
  var lines = t.split('\n');
  var head = lines.filter(function (l) { return /e-?mail/i.test(l); })[0] ||
             lines.filter(function (l) { return l.trim(); })[0] || '';
  var count = function (ch) { return head.split(ch).length - 1; };
  var delim = ',';
  if (count('\t') > count(',') && count('\t') >= count(';')) delim = '\t';
  else if (count(';') > count(',')) delim = ';';

  var rows = [], row = [], cell = '', quoted = false;
  for (var i = 0; i < t.length; i++) {
    var ch = t.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (t.charAt(i + 1) === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true; cell = '';
    } else if (ch === delim) {
      row.push(cell); cell = '';
    } else if (ch === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
}

// Skips any lines above the header row (the first row that names an email column).
function trimToHeader_(rows) {
  for (var i = 0; i < Math.min(rows.length, 15); i++) {
    if (mapHeaders_(rows[i]).email >= 0) return rows.slice(i);
  }
  return rows;
}

// Makes every row as wide as the widest one, so missing cells read as empty.
function padRows_(rows) {
  var w = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  return rows.map(function (r) { while (r.length < w) r.push(''); return r; });
}

function leadRowsFromText_(text) {
  return padRows_(trimToHeader_(parseCsvText_(text)));
}

var REQUIRED_COLS_ = [['email', 'Email'], ['first', 'First Name'], ['subject', 'Subject'],
                      ['message', 'Message'], ['fu1', 'Follow-up 1'], ['fu2', 'Follow-up 2']];

// Checks a lead file before import: which required columns exist and how many cells are empty.
function checkLeadRows_(rows) {
  var map = mapHeaders_(rows[0] || []);
  if (map.email < 0 && rows.length > 1) map.email = guessEmailColumn_(rows);
  var cols = REQUIRED_COLS_.map(function (c) {
    var idx = map[c[0]];
    if (c[0] === 'first' && idx < 0) idx = map.full;
    return { label: c[1], idx: idx };
  });
  var empty = cols.map(function () { return 0; });
  var leads = 0, noEmail = 0, sample = '';
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    var email = map.email >= 0 ? normEmail_(row[map.email]) : '';
    if (!email) { noEmail++; continue; }
    leads++;
    cols.forEach(function (c, k) {
      if (c.idx >= 0 && String(row[c.idx] === undefined || row[c.idx] === null ? '' : row[c.idx]).trim() === '') empty[k]++;
    });
    if (!sample) {
      var pick = function (i) { return i >= 0 ? String(row[i] || '').trim() : ''; };
      sample = [email, pick(cols[1].idx), pick(map.company), pick(map.subject)].filter(String).join(' | ');
    }
  }
  return {
    leads: leads,
    noEmail: noEmail,
    columns: cols.map(function (c) { return { label: c.label, ok: c.idx >= 0 }; }),
    missing: cols.filter(function (c) { return c.idx < 0; }).map(function (c) { return c.label; }),
    gaps: cols.map(function (c, k) { return { label: c.label, count: empty[k] }; })
              .filter(function (g) { return g.count > 0; }),
    sample: sample
  };
}

// Extra lines for the import summary about missing columns and empty cells.
function gapsText_(chk) {
  var t = '';
  if (chk.missing.length) t += '\n\nMISSING COLUMNS: ' + chk.missing.join(', ') + '.';
  if (chk.gaps.length) {
    t += '\n\nEmpty cells: ' + chk.gaps.map(function (g) { return g.label + ' (' + g.count + ')'; }).join(', ') +
      '. Fill them in on the Leads tab before those emails are due.';
  }
  return t;
}

function importRows_(ss, values, source, sendFrom) {
  var map = mapHeaders_(values[0]);
  if (map.email < 0) map.email = guessEmailColumn_(values);
  if (map.email < 0) throw new Error('Could not find an email column. Name one of your columns "Email".');

  var ld = ss.getSheetByName(SHEET.LEADS);
  var lc = colMap_(ld);
  var res = { imported: 0, duplicate: 0, invalid: 0, blocked: 0, unassigned: 0, noMessage: 0,
              chosen: 0, unknownSender: 0, sendFrom: sendFrom || '',
              source: source, foundMessage: map.message >= 0 };

  var result = withLock_(function () {
    var existing = ld.getLastRow() > 1 ? ld.getRange(2, 1, ld.getLastRow() - 1, ld.getLastColumn()).getValues() : [];
    var seen = {};
    var maxId = 0;
    var waiting = {};
    existing.forEach(function (row) {
      seen[normEmail_(row[lc['Email']])] = true;
      var n = parseInt(String(row[lc['Lead ID']]).replace(/\D/g, ''), 10);
      if (n > maxId) maxId = n;
      if (row[lc['Status']] === STATUS.NEW) {
        var ib = normEmail_(row[lc['Assigned Inbox']]);
        waiting[ib] = (waiting[ib] || 0) + 1;
      }
    });
    var dnc = loadDnc_(ss);
    var inboxes = activeInboxes_(ss);
    var known = {};
    allInboxes_(ss).forEach(function (i) { known[i] = true; });
    inboxes.forEach(function (i) { waiting[i] = waiting[i] || 0; });

    var now = new Date();
    var out = [];
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var email = normEmail_(row[map.email]);
      if (!email) continue;
      if (!isValidEmail_(email)) { res.invalid++; continue; }
      if (seen[email]) { res.duplicate++; continue; }
      if (isBlocked_(email, dnc)) { res.blocked++; continue; }
      seen[email] = true;

      var first = map.first >= 0 ? tidyName_(row[map.first]) : '';
      var last = map.last >= 0 ? tidyName_(row[map.last]) : '';
      if (!first && map.full >= 0) {
        var parts = tidyName_(row[map.full]).split(/\s+/);
        first = parts.shift() || '';
        if (!last) last = parts.join(' ');
      }
      var extra = {};
      map.extras.forEach(function (c) {
        var v = row[c];
        if (v !== '' && v !== null && v !== undefined) extra[fieldKey_(values[0][c])] = String(v).trim();
      });

      var inbox = '';
      var wanted = map.sendFrom >= 0 ? normEmail_(row[map.sendFrom]) : '';
      if (wanted && !known[wanted]) { res.unknownSender++; wanted = ''; }
      if (wanted || sendFrom) {
        inbox = wanted || sendFrom;
        waiting[inbox] = (waiting[inbox] || 0) + 1;
        res.chosen++;
      } else if (inboxes.length) {
        inbox = inboxes.reduce(function (best, i) { return waiting[i] < waiting[best] ? i : best; }, inboxes[0]);
        waiting[inbox]++;
      } else {
        res.unassigned++;
      }

      maxId++;
      var line = new Array(ld.getLastColumn()).fill('');
      line[lc['Lead ID']] = 'L' + ('00000' + maxId).slice(-5);
      line[lc['Email']] = email;
      line[lc['First Name']] = first;
      line[lc['Last Name']] = last;
      line[lc['Company']] = map.company >= 0 ? String(row[map.company]).trim() : '';
      var cell = function (c) { return c >= 0 ? cleanText_(row[c]) : ''; };
      line[lc['Subject']] = cell(map.subject);
      line[lc['Message']] = spaceOut_(cell(map.message));
      line[lc['Follow-up 1 Message']] = spaceOut_(cell(map.fu1));
      line[lc['Follow-up 2 Message']] = spaceOut_(cell(map.fu2));
      if (lc['Variant'] !== undefined) line[lc['Variant']] = cell(map.variant);
      if (!line[lc['Message']]) res.noMessage++;
      line[lc['Status']] = line[lc['Message']] ? STATUS.NEW : STATUS.NEEDS;
      line[lc['Assigned Inbox']] = inbox;
      line[lc['Emails Sent']] = 0;
      line[lc['Source']] = source;
      line[lc['Imported At']] = now;
      line[lc['Extra Fields']] = Object.keys(extra).length ? JSON.stringify(extra) : '';
      out.push(line);
    }
    if (out.length) {
      var startRow = ld.getLastRow() + 1;
      var need = startRow + out.length - 1 - ld.getMaxRows();
      if (need > 0) ld.insertRowsAfter(ld.getMaxRows(), need + 500);
      ld.getRange(startRow, 1, out.length, out[0].length).setValues(out);
    }
    res.imported = out.length;
    return res;
  });
  if (result.imported) log_(ss, me_(), '', 'IMPORT', '', result.imported + ' leads from ' + source, '', '');
  return result;
}

function importSummary_(res) {
  var msg = 'Imported ' + res.imported + ' new leads from "' + res.source + '".\n\n' +
    'Skipped: ' + res.duplicate + ' already in the sheet, ' + res.invalid + ' invalid emails, ' +
    res.blocked + ' on the Do Not Contact list.';
  if (!res.foundMessage) {
    msg += '\n\nWARNING: no message column was found. Name it "Message" (and optionally ' +
      '"Subject", "Follow-up 1", "Follow-up 2"). These leads are marked "Needs message".';
  } else if (res.noMessage) {
    msg += '\n\n' + res.noMessage + ' leads had an empty message and are marked "Needs message". ' +
      'Fill in their Message cell and set Status to New to send them.';
  }
  if (res.sendFrom) {
    msg += '\n\nSending Gmail: ' + res.sendFrom + (res.chosen < res.imported ? ' (except rows with their own Send From)' : '') + '.';
  } else if (res.chosen) {
    msg += '\n\n' + res.chosen + ' leads were given the Gmail named in their Send From column; the rest were spread evenly.';
  } else {
    msg += '\n\nLeads were spread evenly across your active Gmails.';
  }
  if (res.unknownSender) {
    msg += '\n\n' + res.unknownSender + ' rows named a Send From Gmail that is not on the Inboxes tab, ' +
      'so they were spread evenly instead.';
  }
  if (res.unassigned) {
    msg += '\n\n' + res.unassigned + ' leads have no inbox yet because no inbox is Active. ' +
      'Connect your Gmails, then click "Spread waiting leads across inboxes".';
  }
  return msg;
}

function rebalanceLeads() {
  askAllPermissions_();
  var ss = ss_();
  var inboxes = activeInboxes_(ss);
  if (!inboxes.length) return alert_('No Active inboxes on the Inboxes tab yet.');
  var ld = ss.getSheetByName(SHEET.LEADS);
  var lc = colMap_(ld);
  if (ld.getLastRow() < 2) return alert_('No leads yet.');

  var evenAll = false;
  var ui = ui_();
  if (ui) {
    var b = ui.alert('Spread waiting leads',
      'YES = re-spread ALL waiting leads evenly across ' + inboxes.length + ' active Gmails ' +
      '(this replaces any Gmail you picked for them).\n\n' +
      'NO = only give a Gmail to waiting leads that have none, or whose Gmail is paused ' +
      '(keeps the Gmails you picked).',
      ui.ButtonSet.YES_NO_CANCEL);
    if (b === ui.Button.CANCEL || b === ui.Button.CLOSE) return;
    evenAll = (b === ui.Button.YES);
  }

  var moved = withLock_(function () {
    var n = ld.getLastRow() - 1;
    var status = ld.getRange(2, lc['Status'] + 1, n, 1).getValues();
    var assigned = ld.getRange(2, lc['Assigned Inbox'] + 1, n, 1).getValues();
    var active = {}, load = {};
    inboxes.forEach(function (i) { active[i] = true; load[i] = 0; });
    if (!evenAll) {
      for (var a = 0; a < n; a++) {
        var cur = normEmail_(assigned[a][0]);
        if (status[a][0] === STATUS.NEW && active[cur]) load[cur]++;
      }
    }
    var k = 0, count = 0;
    for (var i = 0; i < n; i++) {
      if (status[i][0] !== STATUS.NEW) continue;
      var was = normEmail_(assigned[i][0]);
      var target;
      if (evenAll) {
        target = inboxes[k++ % inboxes.length];
      } else {
        if (active[was]) continue;
        target = inboxes.reduce(function (best, x) { return load[x] < load[best] ? x : best; }, inboxes[0]);
        load[target]++;
      }
      if (was !== target) count++;
      assigned[i][0] = target;
    }
    ld.getRange(2, lc['Assigned Inbox'] + 1, n, 1).setValues(assigned);
    return count;
  });
  alert_('Done: ' + moved + ' waiting leads were given a new Gmail' +
    (evenAll ? ' (all waiting leads are now spread evenly across ' + inboxes.length + ' active Gmails).' : '.') +
    '\n\nLeads already in a sequence stay with the Gmail that emailed them, so follow-ups come from the same address.');
}

// ---------------------------------------------------------------- connect

function connectInbox() {
  askAllPermissions_();
  var ui = ui_();
  var me = me_();
  if (!me) return alert_('Could not tell which Gmail you are using. Open this sheet in a browser window where only that Gmail is signed in.');
  requireGmailService_();
  var ss = ss_();
  PropertiesService.getScriptProperties().setProperty('SSID', ss.getId());

  var inbox = findInbox_(ss, me);
  var ib = ss.getSheetByName(SHEET.INBOXES);
  if (!inbox) {
    var name = SENDER_NAME;
    if (!name && ui) {
      var r = ui.prompt('Add ' + me,
        'What sender name should people see? (e.g. "Sarah Jones")', ui.ButtonSet.OK_CANCEL);
      if (r.getSelectedButton() !== ui.Button.OK) return;
      name = r.getResponseText().trim();
    }
    var ic = colMap_(ib);
    var row = lastFilledRow_(ib, ic['Inbox Email'] + 1) + 1;
    ib.getRange(row, ic['Inbox Email'] + 1).setValue(me);
    ib.getRange(row, ic['Sender Name'] + 1).setValue(name || '');
    ib.getRange(row, ic['Status'] + 1).setValue('Active');
    inbox = findInbox_(ss, me);
  } else if (SENDER_NAME && !inbox.name) {
    setInboxCell_(ss, inbox.row, 'Sender Name', SENDER_NAME);
  }

  setRunTrigger_();

  setInboxCell_(ss, inbox.row, 'Connected', 'Yes, ' +
    Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm'));
  setInboxCell_(ss, inbox.row, 'Last Run', new Date());   // so no other Gmail takes its leads before its first run
  if (inbox.status !== 'Active') setInboxCell_(ss, inbox.row, 'Status', 'Active');
  log_(ss, me, '', 'CONNECTED', '', 'Sending turned on (every ' + RUN_EVERY_MINUTES + ' minutes)', '', '');

  var st = readSettings_(ss);
  alert_('Connected: ' + me + '\n\nIt will now run every ' + RUN_EVERY_MINUTES + ' minutes between ' + st.startHour + ':00 and ' +
    st.endHour + ':00, sending only the leads assigned to it, and checking for replies and bounces.' +
    '\n\nTip: click "Spread waiting leads across inboxes" after connecting new Gmails.');
}

function disconnectInbox() {
  askAllPermissions_();
  var ss = ss_();
  var me = me_();
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runForMe') { ScriptApp.deleteTrigger(t); n++; }
  });
  var inbox = findInbox_(ss, me);
  if (inbox) {
    setInboxCell_(ss, inbox.row, 'Connected', 'No');
    setInboxCell_(ss, inbox.row, 'Status', 'Paused');
  }
  PropertiesService.getScriptProperties().deleteProperty('RUN_EVERY');
  log_(ss, me, '', 'DISCONNECTED', '', 'Sending turned off', '', '');
  alert_(n ? 'Stopped. ' + me + ' will not send any more emails.' : 'This Gmail was not connected.');
}

function whoAmI() {
  alert_('You are using: ' + (me_() || '(unknown)') +
    '\n\nAnything you click in this menu happens as this Gmail.' +
    '\n\nScript version: ' + CORE_VERSION + (viaLoader_() ? ' (updates automatically, loader ' +
      (OUTREACH_CONFIG.loaderVersion || 1) + ')' : ' (pasted by hand)'));
}

// True when this code was loaded by Loader.gs.
function viaLoader_() {
  return typeof OUTREACH_CONFIG === 'object' && !!OUTREACH_CONFIG;
}

// ---------------------------------------------------------------- the regular run

// Each Gmail runs every 15 minutes: new leads start going out within 15 minutes, and one
// slow or failed run only costs 15 minutes instead of an hour.
var RUN_EVERY_MINUTES = 15;
var REPLY_CHECK_MINUTES = 25;   // replies & bounces are checked at most this often (Run now always checks)
var RUN_BUDGET_MS = 270000;     // stop starting new work after 4.5 minutes (Google stops a run at 6)
var REPLY_BUDGET_MS = 90000;    // the reply check gets at most 1.5 minutes, so sending always gets a turn
var STUCK_HOURS = 3;            // a Gmail with no run for this long counts as stuck
var MAX_SEND_TRIES = 2;         // a lead that fails this often is set to "Send failed" instead of blocking the queue
var QUOTA_ERROR = /limit|quota|too many|rate/i;

function runForMe() { ensureRunTrigger_(); runAndRecord_(false); }

function runNow() { askAllPermissions_(); alert_(runAndRecord_(true)); }

// Gmails connected with an older version run once an hour. This moves them to every 15 minutes.
function ensureRunTrigger_() {
  if (PropertiesService.getScriptProperties().getProperty('RUN_EVERY') === String(RUN_EVERY_MINUTES)) return;
  try { setRunTrigger_(); } catch (e) { console.log('Could not change the trigger: ' + e.message); }
}

// Makes the new trigger first, then removes the old ones, so a Gmail is never left without one.
function setRunTrigger_() {
  var fresh = ScriptApp.newTrigger('runForMe').timeBased().everyMinutes(RUN_EVERY_MINUTES).create();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runForMe' && t.getUniqueId() !== fresh.getUniqueId()) ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().setProperty('RUN_EVERY', String(RUN_EVERY_MINUTES));
}

// Runs one round and writes what happened into the Inboxes tab (Last Result),
// so you can always see why a Gmail did or did not send.
function runAndRecord_(forceCheck) {
  var stamp = function (ss) { return Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MMM d HH:mm'); };
  // Written first: if Google cuts the run off, this stays and says so.
  try {
    var ss0 = ss_();
    var inbox0 = findInbox_(ss0, me_());
    if (inbox0) setInboxCell_(ss0, inbox0.row, 'Last Result', stamp(ss0) +
      ' - Started, did not finish (Google stopped the run). It tries again in ' + RUN_EVERY_MINUTES + ' minutes.');
  } catch (e0) { /* the run below reports the problem */ }
  var result;
  try {
    result = runForInbox_(forceCheck);
  } catch (e) {
    result = 'ERROR: ' + e.message;
    try { log_(ss_(), me_(), '', 'ERROR', '', 'Run failed: ' + e.message, '', ''); } catch (e2) { /* ignore */ }
  }
  try {
    var ss = ss_();
    var inbox = findInbox_(ss, me_());
    if (inbox) setInboxCell_(ss, inbox.row, 'Last Result', stamp(ss) + ' - ' + result);
  } catch (e3) { /* ignore */ }
  return result;
}

function checkNow() {
  askAllPermissions_();
  var ss = ss_();
  requireGmailService_();
  var st = readSettings_(ss);
  alert_(checkInbox_(ss, me_(), st));
}

function runForInbox_(forceCheck) {
  var started = Date.now();
  var me = me_();
  var userLock = LockService.getUserLock();
  if (!userLock.tryLock(5000)) return 'A run for this Gmail is already in progress.';
  try {
    requireGmailService_();
    var ss = ss_();
    var tz = ss.getSpreadsheetTimeZone();
    var st = readSettings_(ss);
    var inbox = findInbox_(ss, me);
    if (!inbox) return me + ' is not on the Inboxes tab. Use "Connect THIS Gmail" first.';
    var now = new Date();
    setInboxCell_(ss, inbox.row, 'Last Run', now);
    var scan = logScan_(ss, me, now);
    var notes = [];
    var resumed = function () { scan.lastResume = now; scan.recentSent = 0; scan.recentBounces = 0; };

    // Paused for bounces: restart by itself after the cool-down, unless it keeps happening.
    if (isBouncePaused_(inbox.status) && scan.lastPause) {
      var restartAt = new Date(scan.lastPause.getTime() + st.autoResume * 86400000);
      if (scan.pauses14 >= 3) {
        notes.push('Paused for bounces ' + scan.pauses14 + ' times in 14 days, so it will not restart by itself. ' +
          'Check your lead lists with an email checker, then set Status to Active.');
      } else if (st.autoResume > 0 && now >= restartAt) {
        setInboxCell_(ss, inbox.row, 'Status', 'Active');
        log_(ss, me, '', 'INBOX_RESUMED', '', 'Restarted automatically after the bounce pause (warm-up from day 1)', '', '');
        inbox.status = 'Active';
        resumed();
        notes.push('Restarted automatically after the bounce pause, warming up again.');
      } else if (st.autoResume > 0) {
        notes.push('Restarts by itself on ' + Utilities.formatDate(restartAt, tz, 'MMM d HH:mm') + '.');
      }
    } else if (isActive_(inbox.status) && scan.lastPause && !(scan.lastResume >= scan.lastPause)) {
      // Set back to Active by hand: from now on it is judged on its new sends only.
      log_(ss, me, '', 'INBOX_RESUMED', '', 'Turned back on by hand (warm-up from day 1)', '', '');
      resumed();
    }

    var checked = '';
    var props = PropertiesService.getScriptProperties();
    if (forceCheck || Date.now() - Number(props.getProperty('LAST_REPLY_CHECK') || 0) >= REPLY_CHECK_MINUTES * 60000) {
      try {
        checked = checkInbox_(ss, me, st, scan.seen, Date.now() + REPLY_BUDGET_MS);
        props.setProperty('LAST_REPLY_CHECK', String(Date.now()));
      } catch (e) {
        // A failed reply check must never stop the sending.
        checked = 'Reply check failed (' + e.message + '), it tries again next run.';
        log_(ss, me, '', 'ERROR', '', 'Reply check failed: ' + e.message, '', '');
      }
    }
    var done = function (msg) { return [msg].concat(notes, checked ? [checked] : []).join(' '); };

    if (st.paused) return done('Paused (Settings -> Pause everything).');
    if (!isActive_(inbox.status)) return done('Inbox status is "' + inbox.status + '".');

    var hour = Number(Utilities.formatDate(now, tz, 'H'));
    var minute = Number(Utilities.formatDate(now, tz, 'm'));
    var dow = Number(Utilities.formatDate(now, tz, 'u')); // 1 = Mon ... 7 = Sun
    if (!st.weekends && dow >= 6) return done('Weekend, not sending.');
    if (hour < st.startHour || hour >= st.endHour) {
      return done('Outside the send window (' + st.startHour + ':00-' + st.endHour + ':00).');
    }

    // Only recent sends count: the last 7 days, and nothing from before it was last turned back on.
    if (scan.recentSent >= 20 && scan.recentBounces / scan.recentSent >= st.bouncePause) {
      var pct = Math.round(100 * scan.recentBounces / scan.recentSent);
      setInboxCell_(ss, inbox.row, 'Status', 'Paused - bounces');
      log_(ss, me, '', 'INBOX_PAUSED', '', 'Bounce rate ' + pct + '% (' + scan.recentBounces + ' of the last ' +
        scan.recentSent + ' sends)', '', '');
      return done('Paused this inbox: ' + pct + '% of its recent emails bounced.' +
        (st.autoResume > 0 ? ' It restarts by itself in ' + st.autoResume + ' day(s).' : ''));
    }

    var ramp = rampFor_(st, inbox);
    var limit = dailyLimitFor_(inbox.limit || st.dailyLimit, ramp, dayIndex_(st.start, now, tz));
    // Turned back on within a week of a bounce pause: warm up again from day 1.
    if (scan.lastResume && scan.lastPause && scan.lastResume - scan.lastPause < 7 * 86400000) {
      limit = dailyLimitFor_(limit, ramp, dayIndex_(scan.lastResume, now, tz));
    }
    var full = inbox.limit || st.dailyLimit;
    var why = limit >= full ? '' : ramp.rampStep > 0 ? ' today (warming up: +' + ramp.rampStep + ' a day until ' + full + ')'
      : ' (held at the warm-up day 1 limit, because the warm-up increase per day is 0)';
    var remaining = limit - scan.sentToday;
    if (remaining <= 0) return done('Daily limit reached: ' + limit + why + '.');
    var quota = st.pace === 'Fast' ? remaining
      : runQuota_(remaining, hour * 60 + minute, st.endHour * 60, RUN_EVERY_MINUTES);

    var ld = ss.getSheetByName(SHEET.LEADS);
    var lc = colMap_(ld);
    var data = ld.getDataRange().getValues();
    var dnc = loadDnc_(ss);
    var maxSteps = 1 + st.followUps;
    var stuck = st.autoMove ? stuckChecker_(ss, me, now) : null;
    var due = [], fresh = [], spare = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[lc['Email']]) continue;
      var owner = normEmail_(row[lc['Assigned Inbox']]);
      var status = String(row[lc['Status']] || '').trim();
      var sent = emailsSent_(row, lc);
      var isNew = status === STATUS.NEW || (status === '' && sent === 0);
      if (owner === me) {
        var next = row[lc['Next Send']];
        if (status === STATUS.ACTIVE && sent < maxSteps && next instanceof Date && next <= now) due.push(i);
        else if (isNew) fresh.push(i);
      } else if (isNew && stuck && stuck(owner)) {
        spare.push(i);
      }
    }
    due.sort(function (a, b) { return data[a][lc['Next Send']] - data[b][lc['Next Send']]; });
    // Leads that failed before go last, so they can never hold up the rest.
    var tries = function (i) { return scan.failures[String(data[i][lc['Lead ID']])] || 0; };
    fresh.sort(function (a, b) { return tries(a) - tries(b); });
    var queue = due.concat(fresh);

    // Nothing (or not enough) of its own: take over New leads from Gmails that are paused or not running.
    if (queue.length < quota && spare.length) {
      var take = spare.slice(0, Math.min(quota - queue.length, 10));
      var from = {};
      take.forEach(function (i) {
        var was = normEmail_(data[i][lc['Assigned Inbox']]) || '(no Gmail)';
        from[was] = (from[was] || 0) + 1;
        updateLead_(ld, lc, data[i][lc['Lead ID']], i + 1, { 'Assigned Inbox': me });
      });
      log_(ss, me, '', 'LEADS_MOVED', '', 'Took over ' + take.length + ' waiting lead(s) from Gmails that are paused or not running: ' +
        Object.keys(from).map(function (k) { return k + ' (' + from[k] + ')'; }).join(', '), '', '');
      notes.push('Took over ' + take.length + ' waiting lead(s) from stuck Gmails.');
      queue = queue.concat(take);
    }
    queue = queue.slice(0, quota);
    if (!queue.length) return done('Nothing due right now.');

    var sentCount = 0, errors = 0;
    for (var q = 0; q < queue.length; q++) {
      if (Date.now() - started > RUN_BUDGET_MS) break;
      var idx = queue[q];
      var leadId = data[idx][lc['Lead ID']];
      // Read the row again: a reply, an edit or another Gmail may have changed it since.
      var cur = leadRowNow_(ld, lc, leadId, idx + 1);
      if (!cur) continue;
      var lead = cur.values;
      if (normEmail_(lead[lc['Assigned Inbox']]) !== me) continue;
      if (String(lead[lc['Status']] || '').trim() !== String(data[idx][lc['Status']] || '').trim()) continue;
      var email = normEmail_(lead[lc['Email']]);

      if (isBlocked_(email, dnc)) {
        updateLead_(ld, lc, leadId, cur.row, { 'Status': STATUS.SKIPPED, 'Next Send': '' });
        log_(ss, me, email, 'SKIPPED', leadId, 'On Do Not Contact list', '', '');
        continue;
      }

      // A lead marked New always starts from the first email, even if its row still holds
      // numbers from an old lead (rows pasted over, or a lead set back to New).
      var leadStatus = String(lead[lc['Status']] || '').trim();
      var isFresh = leadStatus === STATUS.NEW || leadStatus === '';
      var step = isFresh ? 1 : emailsSent_(lead, lc) + 1;
      var vars = leadVars_(lead, lc, inbox.name);
      var text = messageFor_(lead, lc, step, st);
      if (!text) {
        if (step === 1) {
          updateLead_(ld, lc, leadId, cur.row, { 'Status': STATUS.NEEDS });
          log_(ss, me, email, 'SKIPPED', leadId, 'No message to send', '', '');
        } else {
          // no follow-up text for this step: the sequence ends here
          updateLead_(ld, lc, leadId, cur.row, { 'Status': STATUS.DONE, 'Next Send': '' });
          log_(ss, me, email, 'COMPLETED', leadId, 'No text for email ' + step + ', sequence ended', '', '');
        }
        continue;
      }
      var body = composeBody_(text, vars, st);
      var subject = step === 1
        ? render_(String(lead[lc['Subject']] || '').trim() || st.defSubject, vars)
        : 'Re: ' + String(lead[lc['Subject']] || '').replace(/^re:\s*/i, '');
      var prevIds = step === 1 ? '' : String(lead[lc['Message IDs']] || '').trim();

      try {
        var res = sendEmail_({
          to: email, fromEmail: me, fromName: inbox.name, subject: subject, body: body,
          threadId: step > 1 ? lead[lc['Thread ID']] : '',
          references: step > 1 ? prevIds : ''
        });
        var at = new Date();
        var up = { 'Emails Sent': step, 'Thread ID': res.threadId,
                   'Message IDs': (prevIds + ' ' + res.messageIdHeader).trim() };
        up[SENT_COLS[step - 1]] = at;
        if (step === 1) {
          up['Subject'] = subject;
          up['Follow-up 1 Sent'] = '';   // clear dates left over from an old lead in this row
          up['Follow-up 2 Sent'] = '';
        }
        if (step < maxSteps) {
          up['Status'] = STATUS.ACTIVE;
          up['Next Send'] = addDays_(at, step === 1 ? st.fu1Days : st.fu2Days);
        } else {
          up['Status'] = STATUS.DONE;
          up['Next Send'] = '';
        }
        updateLead_(ld, lc, leadId, cur.row, up);
        log_(ss, me, email, SENT_EVENTS[step - 1], leadId, subject, res.threadId, res.id);
        sentCount++;
      } catch (e) {
        errors++;
        var quotaHit = QUOTA_ERROR.test(e.message);
        log_(ss, me, email, 'ERROR', leadId, 'Send failed: ' + e.message, '', '');
        var fail = { 'Notes': 'Send error: ' + e.message };
        if (!quotaHit) {
          var n = (scan.failures[String(leadId)] || 0) + 1;
          scan.failures[String(leadId)] = n;
          if (n >= MAX_SEND_TRIES) {
            fail['Status'] = STATUS.FAILED;
            fail['Next Send'] = '';
            fail['Notes'] = 'Could not send after ' + n + ' tries: ' + e.message + '. Fix the email or message, then set Status back to ' +
              (step === 1 ? 'New' : 'In sequence') + '.';
          }
        }
        updateLead_(ld, lc, leadId, cur.row, fail);
        if (quotaHit || errors >= 3) break;
      }

      if (q < queue.length - 1) {
        // Google allows each Gmail about 90 minutes of script time a day, and the pauses count.
        // With a high daily limit the pauses get shorter, so the whole day fits in about 45 minutes.
        var maxW = Math.min(st.maxDelay, Math.max(5, 2700 / limit));
        var minW = Math.min(st.minDelay, maxW);
        var wait = minW + Math.random() * Math.max(0, maxW - minW);
        if (Date.now() - started + wait * 1000 > RUN_BUDGET_MS) break;
        Utilities.sleep(Math.round(wait * 1000));
      }
    }
    return done('Sent ' + sentCount + ' email(s)' + (errors ? ', ' + errors + ' error(s) (see Log)' : '') +
      '. Today: ' + (scan.sentToday + sentCount) + '/' + limit + why + '.');
  } finally {
    userLock.releaseLock();
  }
}

// One pass over the Log for this Gmail: sends today, the recent bounce rate, past pauses,
// failed sends per lead, and the Gmail message IDs already handled.
function logScan_(ss, me, now) {
  var DAY = 86400000;
  var out = { sentToday: 0, totalSent: 0, bounces: 0, recentSent: 0, recentBounces: 0,
              lastPause: null, lastResume: null, pauses14: 0, failures: {}, seen: {} };
  var lg = ss.getSheetByName(SHEET.LOG);
  if (lg.getLastRow() < 2) return out;
  var v = lg.getRange(2, 1, lg.getLastRow() - 1, 8).getValues();
  var midnight = startOfToday_(ss);
  var mine = [];
  v.forEach(function (r) {
    if (normEmail_(r[1]) !== me) return;
    var ts = r[0] instanceof Date ? r[0] : null;
    var ev = String(r[3]);
    if (r[7]) out.seen[String(r[7])] = true;
    if (ev === 'INBOX_PAUSED' && ts) {
      if (!out.lastPause || ts > out.lastPause) out.lastPause = ts;
      if (now - ts < 14 * DAY) out.pauses14++;
    } else if (ev === 'INBOX_RESUMED' && ts) {
      if (!out.lastResume || ts > out.lastResume) out.lastResume = ts;
    } else if (ev === 'ERROR' && r[4] && /^Send failed/.test(String(r[5])) && !QUOTA_ERROR.test(String(r[5]))) {
      out.failures[String(r[4])] = (out.failures[String(r[4])] || 0) + 1;
    } else if (ev.indexOf('SENT') === 0 || ev === 'BOUNCE') {
      mine.push(r);
    }
  });
  var since = new Date(now.getTime() - 7 * DAY);
  if (out.lastResume && out.lastResume > since) since = out.lastResume;
  var lastSend = {};
  mine.forEach(function (r) {
    if (String(r[3]) === 'BOUNCE') return;
    out.totalSent++;
    if (r[0] instanceof Date) {
      if (r[0] >= midnight) out.sentToday++;
      if (r[0] >= since) out.recentSent++;
      var id = String(r[4]);
      if (!lastSend[id] || r[0] > lastSend[id]) lastSend[id] = r[0];
    }
  });
  mine.forEach(function (r) {
    if (String(r[3]) !== 'BOUNCE') return;
    out.bounces++;
    var s = lastSend[String(r[4])];
    if (s && s >= since) out.recentBounces++;   // only bounces of emails sent in the window count
  });
  return out;
}

// Says whether another Gmail's waiting leads may be taken over: it is paused, not on the
// Inboxes tab, never ran, or has not run for STUCK_HOURS (its trigger stopped).
function stuckChecker_(ss, me, now) {
  var ib = ss.getSheetByName(SHEET.INBOXES);
  var ic = colMap_(ib);
  if (ic['Last Run'] === undefined || ib.getLastRow() < 2) return null;
  var working = {};
  ib.getRange(2, 1, ib.getLastRow() - 1, ib.getLastColumn()).getValues().forEach(function (r) {
    var email = normEmail_(r[ic['Inbox Email']]);
    var last = r[ic['Last Run']];
    if (email) working[email] = isActive_(r[ic['Status']]) && last instanceof Date &&
      now - last < STUCK_HOURS * 3600000;
  });
  return function (owner) { return owner !== me && !working[owner]; };
}

// ---------------------------------------------------------------- replies & bounces

// seen: Gmail message IDs already handled (read from the Log when not given).
// deadline: stop looking at more emails after this time; the rest is checked next run.
function checkInbox_(ss, me, st, seen, deadline) {
  var ld = ss.getSheetByName(SHEET.LEADS);
  var lc = colMap_(ld);
  var data = ld.getDataRange().getValues();
  var byThread = {}, byEmail = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (normEmail_(row[lc['Assigned Inbox']]) !== me) continue;
    var s = row[lc['Status']];
    if (s !== STATUS.ACTIVE && s !== STATUS.DONE) continue;
    if (row[lc['Thread ID']]) byThread[String(row[lc['Thread ID']])] = i;
    byEmail[normEmail_(row[lc['Email']])] = i;
  }
  if (!Object.keys(byEmail).length) return 'No contacted leads to check.';

  seen = seen || processedIds_(ss, me);
  deadline = deadline || Date.now() + 240000;
  var found = GmailApp.search('in:anywhere newer_than:4d -from:me', 0, 300);
  if (!found.length) return 'No new replies or bounces.';
  // Threads we emailed first: replies and most bounces are in them. Then everything else, while time allows.
  var threads = found.filter(function (th) { return byThread[th.getId()] !== undefined; })
    .concat(found.filter(function (th) { return byThread[th.getId()] === undefined; }));
  var label = null;
  var replies = 0, bounces = 0, autos = 0, cut = false;
  var all = [], CHUNK = 50;

  for (var t = 0; t < threads.length; t++) {
    if (t % CHUNK === 0) {
      if (t > 0 && Date.now() > deadline) { cut = true; break; }
      all = GmailApp.getMessagesForThreads(threads.slice(t, t + CHUNK));
    }
    var tid = threads[t].getId();
    var msgs = all[t % CHUNK];
    for (var m = 0; m < msgs.length; m++) {
      var msg = msgs[m];
      var mid = msg.getId();
      if (seen[mid]) continue;
      var fromRaw = msg.getFrom();
      var from = extractEmail_(fromRaw);
      if (!from || from === me) continue;

      if (isBounceSender_(from, fromRaw)) {
        var body = msg.getPlainBody() || '';
        if (isDelayNotice_(msg.getSubject(), body)) continue;
        var bi = byThread[tid];
        if (bi === undefined) {
          var failed = extractEmail_(msg.getHeader('X-Failed-Recipients') || '');
          if (failed && byEmail[failed] !== undefined) bi = byEmail[failed];
        }
        if (bi === undefined) {
          var found = (body.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
            .map(normEmail_).filter(function (e) { return byEmail[e] !== undefined; })[0];
          if (found) bi = byEmail[found];
        }
        if (bi === undefined || data[bi][lc['Status']] === STATUS.BOUNCED) continue;
        var bLead = data[bi];
        var bEmail = normEmail_(bLead[lc['Email']]);
        updateLead_(ld, lc, bLead[lc['Lead ID']], bi + 1, {
          'Status': STATUS.BOUNCED, 'Bounced At': msg.getDate(),
          'Bounce Reason': bounceReason_(body), 'Next Send': ''
        });
        addDnc_(ss, bEmail, 'Bounced');
        log_(ss, me, bEmail, 'BOUNCE', bLead[lc['Lead ID']], bounceReason_(body), tid, mid);
        bLead[lc['Status']] = STATUS.BOUNCED;
        seen[mid] = true;
        bounces++;
        continue;
      }

      var ri = byThread[tid];
      if (ri === undefined) ri = byEmail[from];
      if (ri === undefined) continue;
      var lead = data[ri];
      var firstSent = lead[lc['Email 1 Sent']];
      if (firstSent instanceof Date && msg.getDate() < firstSent) continue;
      var cur = lead[lc['Status']];
      if (cur === STATUS.REPLIED || cur === STATUS.UNSUB || cur === STATUS.BOUNCED) continue;
      var leadEmail = normEmail_(lead[lc['Email']]);

      if (isAutoReply_(msg.getSubject(), msg.getHeader('Auto-Submitted'),
          msg.getHeader('X-Autoreply') || msg.getHeader('X-Autorespond'), msg.getHeader('Precedence'))) {
        log_(ss, me, leadEmail, 'AUTO_REPLY', lead[lc['Lead ID']], msg.getSubject(), tid, mid);
        seen[mid] = true;
        autos++;
        continue;
      }

      var snippet = replySnippet_(msg.getPlainBody() || '');
      var unsub = isUnsubscribe_(snippet);
      updateLead_(ld, lc, lead[lc['Lead ID']], ri + 1, {
        'Status': unsub ? STATUS.UNSUB : STATUS.REPLIED,
        'Replied At': msg.getDate(), 'Reply Snippet': snippet, 'Next Send': ''
      });
      if (unsub) addDnc_(ss, leadEmail, 'Asked to be removed');
      log_(ss, me, leadEmail, unsub ? 'UNSUB' : 'REPLY', lead[lc['Lead ID']], snippet.slice(0, 200), tid, mid);
      lead[lc['Status']] = unsub ? STATUS.UNSUB : STATUS.REPLIED;
      seen[mid] = true;
      replies++;
      try {
        label = label || GmailApp.getUserLabelByName('Outreach Replies') || GmailApp.createLabel('Outreach Replies');
        threads[t].addLabel(label);
      } catch (e) { /* labels are a nice-to-have */ }
    }
  }
  return 'Found ' + replies + ' new repl' + (replies === 1 ? 'y' : 'ies') + ', ' + bounces +
    ' bounce(s), ' + autos + ' auto-repl' + (autos === 1 ? 'y' : 'ies') + '.' +
    (cut ? ' (Checked the most important emails; the rest next run.)' : '');
}

// ---------------------------------------------------------------- test email

function sendTestEmail() {
  askAllPermissions_();
  requireGmailService_();
  var ss = ss_();
  var me = me_();
  var st = readSettings_(ss);
  var inbox = findInbox_(ss, me) || { name: 'Your Name' };
  var ld = ss.getSheetByName(SHEET.LEADS);
  var lc = colMap_(ld);
  var data = ld.getDataRange().getValues();
  var sample = null;
  for (var i = 1; i < data.length; i++) {
    if (data[i][lc['Message']] && normEmail_(data[i][lc['Assigned Inbox']]) === me) { sample = data[i]; break; }
  }
  for (var k = 1; !sample && k < data.length; k++) if (data[k][lc['Message']]) sample = data[k];
  if (!sample) return alert_('Import at least one lead with a Message first, then try again.');

  var vars = leadVars_(sample, lc, inbox.name);
  var subject = render_(String(sample[lc['Subject']] || '').trim() || st.defSubject, vars);
  var parts = [];
  for (var step = 1; step <= 1 + st.followUps; step++) {
    var text = messageFor_(sample, lc, step, st);
    parts.push((step === 1 ? '===== FIRST EMAIL =====' : '===== FOLLOW-UP ' + (step - 1) + ' =====') +
      '\n\n' + (text ? composeBody_(text, vars, st) : '(nothing to send for this step)'));
  }
  sendEmail_({ to: me, fromEmail: me, fromName: inbox.name, subject: '[TEST] ' + subject,
               body: 'Preview of what ' + vars.email + ' would receive from ' + me + ':\n\n' +
                     parts.join('\n\n\n') });
  alert_('Test email sent to ' + me + ' using lead ' + vars.email + '. Check that inbox.');
}

// ---------------------------------------------------------------- sending

function sendEmail_(o) {
  var lines = [
    'From: ' + formatFrom_(o.fromName, o.fromEmail),
    'To: ' + o.to,
    'Subject: ' + encodeHeader_(o.subject),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64'
  ];
  if (o.references) {
    var ids = String(o.references).split(/\s+/).filter(String);
    if (ids.length) {
      lines.push('In-Reply-To: ' + ids[ids.length - 1]);
      lines.push('References: ' + ids.join(' '));
    }
  }
  var body = String(o.body).replace(/\r?\n/g, '\r\n');
  var b64 = Utilities.base64Encode(body, Utilities.Charset.UTF_8).replace(/(.{76})/g, '$1\r\n');
  var raw = lines.join('\r\n') + '\r\n\r\n' + b64;
  var resource = { raw: Utilities.base64EncodeWebSafe(raw) };
  if (o.threadId) resource.threadId = String(o.threadId);
  var sent = Gmail.Users.Messages.send(resource, 'me');
  var header = '';
  try {
    var meta = Gmail.Users.Messages.get('me', sent.id, { format: 'metadata', metadataHeaders: ['Message-ID'] });
    (meta.payload.headers || []).forEach(function (h) {
      if (String(h.name).toLowerCase() === 'message-id') header = h.value;
    });
  } catch (e) { /* threading still works through threadId */ }
  return { id: sent.id, threadId: sent.threadId, messageIdHeader: header };
}

function formatFrom_(name, email) {
  if (!name) return email;
  return (/[^\x20-\x7E]/.test(name) ? encodeHeader_(name) : '"' + String(name).replace(/["\\]/g, '') + '"') +
    ' <' + email + '>';
}

function encodeHeader_(s) {
  s = String(s || '');
  if (!/[^\x20-\x7E]/.test(s)) return s;
  return '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?=';
}

// ---------------------------------------------------------------- sheet helpers


// ---------------------------------------------------------------- changelog

// Every version, newest first. Shown in Outreach -> What's new after each update.
// When you publish an update: add an entry at the top, and set CORE_BUILD and CORE_VERSION to match.
// Each item: [kind, what changed, where to find it]. kind: New, Improved, Fixed, Changed or Removed.
// repair: true = people should click "Apply the update to this sheet" (runs Set up / repair).
var CHANGELOG = [
  { v: 37, date: '2026-10-22', title: 'Choose your own warm-up', repair: true, items: [
    ['New', 'Each Gmail can have its own warm-up: how many on day 1, and how many more each day. Blank = the Settings warm-up. 0 on day 1 = no warm-up for that Gmail.', 'Inboxes tab -> Warm-up Day 1 and Warm-up Per Day columns (far right). Click "Apply the update to this sheet" below to add them'],
    ['Changed', 'The Settings warm-up accepts 0 to 500 on day 1 (it was 0 to 50).', 'Settings -> Warm-up: day 1 limit'],
    ['Changed', 'Admin: Gmails with their warm-up turned off are flagged 🟡.', 'Team tab (admin)']
  ] },
  { v: 36, date: '2026-10-22', title: 'Choose your own daily limit', repair: true, items: [
    ['Changed', 'The daily limit can now be anything from 1 to 500 (it was 1 to 50). 35 or less is still safest for a free Gmail.', 'Settings -> Default daily limit per inbox'],
    ['New', 'Each Gmail can have its own daily limit: type it in that Gmail\'s Daily Limit cell. Blank = the Settings default.', 'Inboxes tab -> Daily Limit column'],
    ['Improved', 'When warm-up keeps a Gmail below its limit, Last Result now says so ("warming up: +5 a day until 60") instead of just "Daily limit reached".', 'Inboxes tab -> Last Result'],
    ['Improved', 'With a high limit, the pauses between emails get shorter, so a Gmail never runs out of Google\'s daily script time and stops halfway through the day.', 'Automatic'],
    ['Changed', 'Admin: a daily limit above 35 is still flagged 🟡, now with which Gmails and their limits.', 'Team tab (admin)']
  ] },
  { v: 35, date: '2026-10-21', title: 'Follow-up tracking', repair: true, items: [
    ['New', 'A Follow-ups section on the Dashboard (every layout): sent today and all time, due today and in the next 3 days, overdue, replies after a follow-up, follow-up reply rate, leads waiting for a follow-up, and leads that finished all emails.', 'Dashboard -> Follow-ups (near the bottom). Click "Apply the update to this sheet" below'],
    ['New', 'The 24-hour report has a Follow-ups part: sent, due today, overdue and replies after a follow-up. Late follow-ups are listed under "To check".', 'Outreach -> My last 24 hours (report)'],
    ['New', 'Leaderboard columns: Follow-ups sent, Follow-ups today, Follow-ups late, Replies after follow-up. Team checks flag follow-ups more than a day late.', 'Leaderboard and Team tabs (admin)'],
    ['Fixed', 'The Dashboard footer showed "vv34".', 'Dashboard footer']
  ] },
  { v: 34, date: '2026-10-21', title: 'Changelog, and the Results by Angle fix', repair: true, items: [
    ['New', 'This "What\'s new" window. It opens from the menu after every update, shows what changed and where to find it, and keeps the full history.', 'Outreach -> What\'s new'],
    ['New', 'Version numbers now count up (v34, v35...) instead of dates.', 'Outreach -> Which Gmail am I using?'],
    ['Fixed', 'Results by Angle showed #REF! ("Array result was not expanded") when the Leads tab had more angles than the panel has rows. It now lists the most-used angles that fit and says how many there are in total.', 'Dashboard (Classic layout) -> Results by Angle. Click "Apply the update to this sheet" below']
  ] },
  { v: 33, date: '2026-10-21', title: 'Results by Angle: first fix', repair: true, items: [
    ['Fixed', 'First attempt at the Results by Angle #REF! error. Replaced by v34.', 'Dashboard -> Results by Angle']
  ] },
  { v: 32, date: '2026-10-21', title: 'Replies window, 24-hour report, admin on the Leaderboard', repair: true, items: [
    ['New', 'Replies window: every reply that needs an outcome, and everyone to follow up (Interested / Follow up later). One click sets the outcome, with an optional note. No more searching the Leads tab.', 'Outreach -> Replies: set outcomes & follow-ups'],
    ['New', '"My last 24 hours" report for team meetings: sent, daily standard met or not (and why), replies, bounces, leads waiting, goal progress and totals. Copy as text for WhatsApp.', 'Outreach -> My last 24 hours (report)'],
    ['New', 'Setting "Daily standard (emails sent per day)" for the report. Blank = what your active Gmails can send today.', 'Settings tab'],
    ['New', 'Dashboard top band shows replies needing an outcome, people to follow up, interested and meetings.', 'Dashboard, under the title'],
    ['New', 'Admin: add or remove your own numbers on the Leaderboard. Leaderboard also shows Need outcome and To follow up.', 'Outreach -> Admin: watch team sheets -> Leaderboard: my own numbers']
  ] },
  { v: 31, date: '2026-10-21', title: 'Faster sending, self-repair, bounce-pause fix', repair: true, items: [
    ['Improved', 'Each Gmail runs every 15 minutes instead of every hour. Connected Gmails switch by themselves.', 'Automatic'],
    ['New', 'Setting "Sending pace": Steady (spread over the day) or Fast (daily limit in about 1-2 hours).', 'Settings -> Sending pace'],
    ['Fixed', 'One lead Gmail refused could block a Gmail for good. It now becomes "Send failed" (reason in Notes) and the rest keep sending.', 'Leads tab -> Status "Send failed"'],
    ['Fixed', 'A slow reply check could use up the whole run so nothing was sent. It now has a time limit.', 'Automatic'],
    ['New', 'Working Gmails take over New leads from Gmails that are paused or have stopped running (Log: LEADS_MOVED). No more re-spreading by hand.', 'Settings -> Move waiting leads off stuck Gmails'],
    ['Fixed', 'A Gmail set back to Active after a bounce pause was paused again straight away. Only its last 7 days, since it was turned back on, now count.', 'Inboxes tab -> Status'],
    ['New', 'Gmails paused for bounces restart by themselves after 2 days, warming up again.', 'Settings -> Restart a Gmail paused for bounces after (days)'],
    ['Improved', 'Last Result says when Google cut a run off.', 'Inboxes tab -> Last Result']
  ] },
  { v: 30, date: '2026-10-20', title: 'Five more Dashboard layouts', repair: false, items: [
    ['New', 'Layouts Executive, Scoreboard, Funnel, Inbox Command and Compact, with a preview of each.', 'Outreach -> Choose dashboard layout']
  ] },
  { v: 29, date: '2026-10-20', title: 'Notion and ClickUp themes', repair: false, items: [
    ['New', 'Colour themes "Notion Style" and "ClickUp Style".', 'Settings -> Colour theme, then Outreach -> Apply colour theme'],
    ['Changed', 'Warm-up increase and bounce-pause rate accept any value.', 'Settings tab']
  ] },
  { v: 28, date: '2026-10-20', title: 'Multi-file upload, reset, Leaderboard, mistake guards', repair: true, items: [
    ['Improved', 'Upload several CSV files at once.', 'Outreach -> Upload a lead file (CSV)'],
    ['New', 'Reset to default settings, keeping your leads.', 'Outreach -> Reset to default settings'],
    ['New', 'Admin Leaderboard ranking every team member.', 'Leaderboard tab (admin)'],
    ['New', 'Google asks "Edit anyway?" before you change parts the script fills in. Settings refuse values that make no sense.', 'Dashboard, Log, Leads, Inboxes, Settings']
  ] },
  { v: 27, date: '2026-10-20', title: 'Emails Sent read correctly', repair: true, items: [
    ['Fixed', 'When the Emails Sent column was formatted as a date, leads were marked Completed without sending.', 'Leads tab -> Emails Sent']
  ] },
  { v: 26, date: '2026-10-20', title: 'New leads always start at email 1', repair: false, items: [
    ['Fixed', 'A lead pasted over an old row kept the old count and was never emailed. New leads now always start at email 1.', 'Leads tab']
  ] },
  { v: 25, date: '2026-10-20', title: 'Ask again for missing permissions', repair: false, items: [
    ['Fixed', 'If a permission was unticked on Google\'s Allow screen, the script now asks again instead of failing.', 'Any menu item']
  ] },
  { v: 24, date: '2026-10-20', title: 'Goal tracker and colour themes', repair: true, items: [
    ['New', 'Goal tracker band: delivered vs goal, where you should be by today, on track or behind.', 'Dashboard'],
    ['New', 'Colour themes Navy, Emerald and Burgundy & Gold.', 'Settings -> Colour theme, then Outreach -> Apply colour theme']
  ] },
  { v: 23, date: '2026-10-20', title: 'Navy and gold look', repair: true, items: [
    ['New', 'Paramount Orbit Scouting Centre design: logo, 16 cards (today, all time, results, pipeline), day by day with replies and bounces.', 'Dashboard'],
    ['New', 'About window.', 'Outreach -> About']
  ] },
  { v: 22, date: '2026-10-20', title: 'Loader v3: spare slots', repair: false, items: [
    ['Improved', 'New menu items can arrive through updates without anyone pasting a new Loader.', 'Automatic']
  ] },
  { v: 21, date: '2026-10-20', title: 'Upload window permission fix', repair: false, items: [
    ['Fixed', '"Not sufficient permissions to call Ui.showModalDialog" when opening the upload window.', 'Outreach -> Upload a lead file (CSV)']
  ] },
  { v: 20, date: '2026-10-20', title: 'Lead prompt: help me decide', repair: false, items: [
    ['New', 'Not sure what to offer or who to target? The AI researches and gives options to pick from.', 'LEAD-PROMPT.txt, question 3']
  ] },
  { v: 19, date: '2026-10-20', title: 'Code link set', repair: false, items: [
    ['Changed', 'The Loader points at the admin\'s Drive copy of Code.gs.', 'Loader.gs -> CODE_URL']
  ] },
  { v: 18, date: '2026-10-20', title: 'Automatic updates', repair: false, items: [
    ['New', 'Everyone pastes Loader.gs once. It downloads the latest code from the admin\'s Drive every hour.', 'Outreach -> Check for updates now']
  ] },
  { v: 17, date: '2026-10-20', title: 'Better, more personal emails', repair: false, items: [
    ['Improved', 'The lead prompt researches real details per lead, writes shorter natural emails, or follows your own email. Shows one lead first for your OK.', 'LEAD-PROMPT.txt']
  ] },
  { v: 16, date: '2026-10-19', title: 'Safe Set up / repair', repair: false, items: [
    ['Fixed', 'Repair on a sheet with a changed header row added empty columns, so data looked missing. It now checks first and explains how to restore.', 'Outreach -> 1. Set up / repair this sheet']
  ] },
  { v: 15, date: '2026-10-19', title: 'Admin Gmail set', repair: false, items: [
    ['Changed', 'Admin set to the owner\'s Gmail.', 'Code.gs -> ADMINS']
  ] },
  { v: 14, date: '2026-10-19', title: 'Admin menu locked', repair: false, items: [
    ['New', 'Only Gmails listed as admins can use the Admin menu. Team Alerts and Team History are protected.', 'Outreach -> Admin: watch team sheets']
  ] },
  { v: 13, date: '2026-10-19', title: 'Admin view', repair: false, items: [
    ['New', 'Watch team members\' sheets: Team, Team Alerts and Team History tabs, checks every 2 hours, flags deleted rows and changed settings.', 'Outreach -> Admin: watch team sheets']
  ] },
  { v: 12, date: '2026-10-19', title: 'Leads you already have', repair: false, items: [
    ['New', 'The lead prompt can write emails for your own list (Apollo, Apify, a spreadsheet).', 'LEAD-PROMPT.txt, answer 1 to the first question']
  ] },
  { v: 11, date: '2026-10-19', title: 'Three files only', repair: false, items: [
    ['Removed', 'Extra files, the Import tab and import-from-link. One way to import.', 'Outreach -> Upload a lead file (CSV)']
  ] },
  { v: 10, date: '2026-10-19', title: 'Simpler lead prompt', repair: false, items: [
    ['Improved', 'The lead prompt asks a few plain questions (type SKIP if unsure).', 'LEAD-PROMPT.txt']
  ] },
  { v: 9, date: '2026-10-19', title: 'Master lead prompt and foolproof upload', repair: false, items: [
    ['New', 'One lead prompt for the whole team, and an upload window that checks columns and empty cells.', 'Outreach -> Upload a lead file (CSV)']
  ] },
  { v: 8, date: '2026-10-18', title: 'Last Result on Inboxes', repair: true, items: [
    ['New', 'Each Gmail shows why it did or did not send on its last run.', 'Inboxes tab -> Last Result']
  ] },
  { v: 7, date: '2026-10-18', title: 'Email angles', repair: true, items: [
    ['New', 'Leads carry an angle (direct pitch, idea offer...) and the Dashboard compares results by angle.', 'Dashboard -> Results by Angle']
  ] },
  { v: 6, date: '2026-10-18', title: 'Lead research prompts', repair: false, items: [
    ['New', 'Prompts that find leads and write their emails as a CSV for the sheet.', 'LEAD-PROMPT.txt']
  ] },
  { v: 5, date: '2026-10-18', title: 'Choose the sending Gmail on import', repair: false, items: [
    ['New', 'Pick which Gmail sends a file, or spread evenly. Spread waiting leads can keep your choices.', 'Upload window, and Outreach -> Spread waiting leads across inboxes']
  ] },
  { v: 4, date: '2026-10-18', title: 'Each Gmail runs its own copy', repair: false, items: [
    ['Changed', 'Sending Gmails other than the owner use their own script copy (Google blocks shared scripts).', 'SETUP.md, Part 2']
  ] },
  { v: 3, date: '2026-10-18', title: 'Upgrade adds new columns', repair: true, items: [
    ['Improved', 'Set up / repair adds new columns to an existing sheet.', 'Outreach -> 1. Set up / repair this sheet']
  ] },
  { v: 2, date: '2026-10-18', title: 'Personal messages per lead', repair: true, items: [
    ['New', 'Each lead has its own subject, message and follow-ups. Signature per Gmail. "Needs message" status.', 'Leads tab']
  ] },
  { v: 1, date: '2026-10-18', title: 'First version', repair: true, items: [
    ['New', 'The outreach tracker: sends from many Gmails with follow-ups, and tracks replies, bounces and opt-outs.', 'SETUP.md']
  ] }
];

// Outreach -> What's new. Uses the loader's spare slot 9. The window calls slot9('repair') to apply
// the update to this sheet. Opening it marks the current version as seen (per person).
function slot9(action) {
  if (action === 'repair') return applyUpdate_();
  askAllPermissions_();
  var ss = ss_();
  loadTheme_(ss);
  var seen = seenBuild_();
  try { PropertiesService.getUserProperties().setProperty('SEEN_BUILD', String(CORE_BUILD)); } catch (e) { /* not essential */ }
  var html = HtmlService.createHtmlOutput(changelogHtml_(THEME, seen)).setWidth(820).setHeight(680);
  SpreadsheetApp.getUi().showModalDialog(html, 'What\'s new in Outreach ' + CORE_VERSION);
}

// The last version this person has seen in the What's new window (0 = never opened it).
function seenBuild_() {
  try { return Number(PropertiesService.getUserProperties().getProperty('SEEN_BUILD') || 0); } catch (e) { return CORE_BUILD; }
}

// "Apply the update to this sheet": the same as Set up / repair, without pop-ups.
function applyUpdate_() {
  var ss = ss_();
  var problem = headerProblems_(ss);
  if (problem) return problem;
  setupSheet();
  return 'Done. This sheet now has everything from ' + CORE_VERSION + '.';
}

function changelogHtml_(T, seen) {
  var fresh = CHANGELOG.filter(function (c) { return c.v > seen && c.v <= CORE_BUILD; });
  if (!fresh.length) fresh = CHANGELOG.slice(0, 1);
  var needRepair = fresh.some(function (c) { return c.repair; });
  var colour = { New: T.good, Improved: T.navy2, Fixed: '#B26A00', Changed: T.muted, Removed: T.bad };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var block = function (c) {
    return '<div class="ver"><div class="vh"><b>v' + c.v + '</b> · ' + esc(c.title) + '<span>' + esc(c.date) + '</span></div>' +
      c.items.map(function (it) {
        return '<div class="it"><em style="background:' + (colour[it[0]] || T.muted) + '">' + esc(it[0]) + '</em><div>' + esc(it[1]) +
          (it[2] ? '<small>Where: ' + esc(it[2]).replace(/ -&gt; /g, ' → ') + '</small>' : '') + '</div></div>';
      }).join('') + '</div>';
  };
  return '<style>body{font-family:Arial,sans-serif;margin:0;padding:0 10px;color:#1D2333}' +
    '.band{background:' + T.navy + ';color:' + T.onNavy + ';border-bottom:3px solid ' + T.gold + ';padding:12px 16px;border-radius:6px;margin-bottom:12px}' +
    '.band b{font-size:17px}.band div{color:' + T.gold2 + ';font-size:12px;margin-top:3px}' +
    '.ver{border:1px solid ' + T.line + ';border-radius:6px;margin-bottom:10px;background:#fff}' +
    '.vh{background:' + T.ivory + ';padding:8px 12px;border-bottom:1px solid ' + T.line + ';font-size:14px}.vh span{float:right;color:#888;font-size:12px}' +
    '.it{display:flex;gap:10px;padding:8px 12px;font-size:13px;line-height:1.4;border-top:1px solid #F2F2F2}.it:first-of-type{border-top:0}' +
    '.it em{font-style:normal;color:#fff;font-size:10px;font-weight:bold;border-radius:3px;padding:2px 6px;height:14px;min-width:54px;text-align:center;flex:none}' +
    '.it small{display:block;color:' + T.muted + ';margin-top:3px}' +
    '.fix{background:#FFF8E5;border-left:4px solid ' + T.gold + ';padding:10px 12px;border-radius:4px;margin-bottom:12px;font-size:13px}' +
    '.btn{background:' + T.navy + ';color:' + T.onNavy + ';border:2px solid ' + T.gold + ';border-radius:4px;padding:8px 16px;font-weight:bold;cursor:pointer;margin-top:8px}' +
    'details{margin:14px 0 20px}summary{cursor:pointer;font-weight:bold;color:' + T.strong + ';padding:6px 0}#msg{margin-left:10px;font-size:12px}</style>' +
    '<div class="band"><b>You\'re on Outreach ' + esc(CORE_VERSION) + '</b><div>' +
    (seen && seen < CORE_BUILD ? 'Changes since you last looked (v' + seen + ')' : 'Latest changes') + '</div></div>' +
    (needRepair ? '<div class="fix"><b>One step for this sheet:</b> some of these changes need the sheet itself updated ' +
      '(new Settings rows, Dashboard). It keeps all your leads and results.<br>' +
      '<button class="btn" id="go" onclick="go()">Apply the update to this sheet</button><span id="msg"></span></div>' : '') +
    fresh.map(block).join('') +
    '<details><summary>Full history: every version since the start (' + CHANGELOG.length + ')</summary>' +
    CHANGELOG.filter(function (c) { return fresh.indexOf(c) < 0; }).map(block).join('') + '</details>' +
    '<script>function go(){var b=document.getElementById("go"),m=document.getElementById("msg");b.disabled=true;m.textContent="Updating the sheet... about 30 seconds.";' +
    'google.script.run.withSuccessHandler(function(r){m.textContent=r;}).withFailureHandler(function(e){b.disabled=false;m.textContent="Could not update: "+(e&&e.message?e.message:e);}).slot9("repair");}</script>';
}

// ---------------------------------------------------------------- replies: outcomes and follow-ups

// Outcomes that mean "this person still needs something from us".
var FOLLOW_OUTCOMES = ['Interested', 'Follow up later'];

// Outreach -> Replies: one window with every reply that still needs you: set the outcome in one click,
// no searching the Leads tab. Uses the loader's spare slot 6. The window calls slot6('outcome', ...) to save.
function slot6(action, leadId, outcome, note) {
  if (action === 'outcome') return setOutcome_(leadId, outcome, note);
  askAllPermissions_();
  var ss = ss_();
  loadTheme_(ss);
  var html = HtmlService.createHtmlOutput(repliesHtml_(THEME, repliesData_(ss))).setWidth(980).setHeight(680);
  SpreadsheetApp.getUi().showModalDialog(html, 'Replies to handle');
}

// Replies with no outcome yet (newest first), and people to follow up (waiting longest first).
function repliesData_(ss) {
  var ld = ss.getSheetByName(SHEET.LEADS);
  var lc = colMap_(ld);
  var tz = ss.getSpreadsheetTimeZone();
  var rows = ld.getLastRow() > 1 ? ld.getRange(2, 1, ld.getLastRow() - 1, ld.getLastColumn()).getValues() : [];
  var need = [], follow = [];
  rows.forEach(function (r) {
    var c = replyCategory_(r, lc);
    if (!c) return;
    var at = r[lc['Replied At']];
    var item = {
      id: String(r[lc['Lead ID']]), email: normEmail_(r[lc['Email']]),
      name: [r[lc['First Name']], r[lc['Last Name']]].join(' ').trim(), company: String(r[lc['Company']] || ''),
      inbox: normEmail_(r[lc['Assigned Inbox']]), snippet: String(r[lc['Reply Snippet']] || ''),
      notes: String(r[lc['Notes']] || ''), outcome: String(r[lc['Outcome']] || '').trim(),
      t: at instanceof Date ? at.getTime() : 0,
      when: at instanceof Date ? Utilities.formatDate(at, tz, 'EEE d MMM, HH:mm') : ''
    };
    (c === 'need' ? need : follow).push(item);
  });
  need.sort(function (a, b) { return b.t - a.t; });
  follow.sort(function (a, b) { return a.t - b.t; });
  return { need: need, follow: follow, outcomes: OUTCOMES };
}

// 'need' = replied, no outcome yet. 'follow' = Interested or Follow up later. '' = nothing to do.
function replyCategory_(r, lc) {
  var status = String(r[lc['Status']] || '').trim();
  if (status === STATUS.UNSUB || status === STATUS.BOUNCED) return '';
  if (status !== STATUS.REPLIED && !(r[lc['Replied At']] instanceof Date)) return '';
  var outcome = String(r[lc['Outcome']] || '').trim();
  if (!outcome) return 'need';
  return FOLLOW_OUTCOMES.indexOf(outcome) >= 0 ? 'follow' : '';
}

// Saves an outcome (and an optional note) chosen in the Replies window, then sends back the new lists.
function setOutcome_(leadId, outcome, note) {
  outcome = String(outcome || '').trim();
  if (outcome && OUTCOMES.indexOf(outcome) < 0) throw new Error('Unknown outcome: ' + outcome);
  var ss = ss_();
  var ld = ss.getSheetByName(SHEET.LEADS);
  var lc = colMap_(ld);
  var cur = leadRowNow_(ld, lc, leadId, -1);
  if (!cur) throw new Error('This lead is no longer on the Leads tab.');
  var up = { 'Outcome': outcome };
  note = String(note || '').trim();
  if (note) {
    var old = String(cur.values[lc['Notes']] || '').trim();
    up['Notes'] = (old ? old + '\n' : '') + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MMM d') + ': ' + note;
  }
  updateLead_(ld, lc, leadId, cur.row, up);
  log_(ss, me_(), normEmail_(cur.values[lc['Email']]), 'OUTCOME', leadId,
    (outcome || 'Outcome cleared') + (note ? ' - ' + note : ''), '', '');
  return repliesData_(ss);
}

// Puts data into a page safely (no "</script>" can end the script early).
function jsonForHtml_(o) {
  return JSON.stringify(o).replace(/</g, '\\u003c');
}

function repliesHtml_(T, data) {
  return '<style>body{font-family:Arial,sans-serif;margin:0;padding:4px 10px;color:#1D2333}' +
    '.tabs{display:flex;gap:8px;margin-bottom:10px}.tab{padding:9px 16px;border-radius:6px;border:2px solid ' + T.line + ';cursor:pointer;font-weight:bold;background:#fff}' +
    '.tab.on{background:' + T.navy + ';color:' + T.onNavy + ';border-color:' + T.gold + '}' +
    '.card{border:1px solid ' + T.line + ';border-left:4px solid ' + T.gold + ';border-radius:6px;padding:10px 12px;margin-bottom:10px;background:#fff}' +
    '.top{display:flex;justify-content:space-between;gap:10px}.who{font-weight:bold;font-size:15px}.meta{color:#666;font-size:12px;margin-top:2px}' +
    '.snip{background:' + T.ivory + ';border-radius:4px;padding:8px 10px;margin:8px 0;white-space:pre-wrap;font-size:13px;line-height:1.4}' +
    '.notes{color:#555;font-size:12px;white-space:pre-wrap;margin-bottom:6px}' +
    '.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
    '.oc{padding:6px 10px;border:1px solid ' + T.line + ';border-radius:14px;background:#fff;cursor:pointer;font-size:12px}' +
    '.oc:hover{border-color:' + T.gold + '}.oc.on{background:' + T.gold + ';color:#fff;border-color:' + T.gold + '}' +
    '.note{flex:1;min-width:180px;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px}' +
    'a{color:' + T.strong + ';font-size:12px;font-weight:bold}.empty{color:#666;padding:30px;text-align:center}' +
    '#msg{color:' + T.good + ';font-size:12px;margin:0 0 8px;min-height:15px}</style>' +
    '<div class="tabs"><div class="tab on" id="t-need" onclick="show(\'need\')"></div><div class="tab" id="t-follow" onclick="show(\'follow\')"></div></div>' +
    '<div id="msg"></div><div id="list"></div>' +
    '<script>var D=' + jsonForHtml_(data) + ',cur="need";' +
    'function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}' +
    'function show(w){cur=w;render();}' +
    'function render(){' +
    'document.getElementById("t-need").textContent="📬 Need an outcome ("+D.need.length+")";' +
    'document.getElementById("t-follow").textContent="🔁 To follow up ("+D.follow.length+")";' +
    'document.getElementById("t-need").className="tab"+(cur=="need"?" on":"");' +
    'document.getElementById("t-follow").className="tab"+(cur=="follow"?" on":"");' +
    'var L=document.getElementById("list");L.innerHTML="";var items=D[cur];' +
    'if(!items.length){L.appendChild(el("div","empty",cur=="need"?"No replies waiting for an outcome. 🎉":"Nobody to follow up right now."));return;}' +
    'items.forEach(function(it){var c=el("div","card");var top=el("div","top");var left=el("div");' +
    'left.appendChild(el("div","who",(it.name||it.email)+(it.company?" · "+it.company:"")));' +
    'left.appendChild(el("div","meta",it.email+"  ·  replied "+(it.when||"(date unknown)")+"  ·  answer from "+(it.inbox||"?")));top.appendChild(left);' +
    'var a=el("a",null,"Open in Gmail ↗");a.href="https://mail.google.com/mail/?authuser="+encodeURIComponent(it.inbox)+"#search/"+encodeURIComponent("from:"+it.email);a.target="_blank";top.appendChild(a);c.appendChild(top);' +
    'c.appendChild(el("div","snip",it.snippet||"(no reply text saved)"));if(it.notes)c.appendChild(el("div","notes","Notes: "+it.notes));' +
    'var row=el("div","row");var note=el("input","note");note.placeholder="Note (optional), e.g. call Tuesday";' +
    'D.outcomes.forEach(function(o){var b=el("button","oc"+(it.outcome==o?" on":""),o);b.onclick=function(){save(it,o,note.value,c);};row.appendChild(b);});' +
    'row.appendChild(note);c.appendChild(row);L.appendChild(c);});}' +
    'function save(it,o,n,c){c.style.opacity=.5;document.getElementById("msg").textContent="Saving...";' +
    'google.script.run.withSuccessHandler(function(d){D=d;document.getElementById("msg").textContent="Saved: "+(it.name||it.email)+" → "+o;render();})' +
    '.withFailureHandler(function(e){c.style.opacity=1;document.getElementById("msg").textContent="Could not save: "+(e&&e.message?e.message:e);}).slot6("outcome",it.id,o,n);}' +
    'render();</script>';
}

// ---------------------------------------------------------------- 24-hour report

// Outreach -> My last 24 hours: a snapshot of the last 24 hours plus the campaign so far,
// big enough to read out in a team meeting. Uses the loader's spare slot 7.
function slot7() {
  askAllPermissions_();
  var ss = ss_();
  loadTheme_(ss);
  var r = reportData_(ss, new Date());
  var html = HtmlService.createHtmlOutput(reportHtml_(THEME, r)).setWidth(760).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'My last 24 hours');
}

// Works everything out from the raw Log, Leads and Inboxes tabs (not the Dashboard).
function reportData_(ss, now) {
  var DAY = 86400000, since = new Date(now.getTime() - DAY);
  var tz = ss.getSpreadsheetTimeZone();
  var st = readSettings_(ss);
  var fmt = function (d, f) { return Utilities.formatDate(d, tz, f); };
  var r = { campaign: st.name, by: me_(), made: fmt(now, 'EEE d MMM yyyy, HH:mm'), from: fmt(since, 'EEE d MMM, HH:mm'),
            sent24: 0, first24: 0, fu24: 0, replies24: 0, bounces24: 0, sentAll: 0, repliesAll: 0, bouncesAll: 0,
            leads: 0, waiting: 0, imported24: 0, needOutcome: 0, followUp: 0, interested: 0, meetings: 0,
            fuAll: 0, fuDue: 0, fuOverdue: 0, fuReplies24: 0, fuRepliesAll: 0, inSeq: 0,
            inboxes: [], problems: [] };
  var tomorrow = new Date(startOfToday_(ss).getTime() + DAY);

  var lg = ss.getSheetByName(SHEET.LOG);
  if (lg.getLastRow() > 1) {
    lg.getRange(2, 1, lg.getLastRow() - 1, 4).getValues().forEach(function (x) {
      var ev = String(x[3]), recent = x[0] instanceof Date && x[0] >= since;
      if (ev.indexOf('SENT') === 0) {
        r.sentAll++;
        if (ev !== 'SENT_1') r.fuAll++;
        if (recent) { r.sent24++; if (ev === 'SENT_1') r.first24++; else r.fu24++; }
      } else if (ev === 'REPLY' || ev === 'UNSUB') {
        r.repliesAll++; if (recent) r.replies24++;
      } else if (ev === 'BOUNCE') {
        r.bouncesAll++; if (recent) r.bounces24++;
      }
    });
  }

  var ld = ss.getSheetByName(SHEET.LEADS);
  var lc = colMap_(ld);
  if (ld.getLastRow() > 1) {
    ld.getRange(2, 1, ld.getLastRow() - 1, ld.getLastColumn()).getValues().forEach(function (x) {
      if (!normEmail_(x[lc['Email']])) return;
      r.leads++;
      var status = String(x[lc['Status']] || '').trim();
      if (status === STATUS.NEW) r.waiting++;
      if (status === STATUS.ACTIVE) {
        r.inSeq++;
        var next = x[lc['Next Send']];
        if (next instanceof Date && next < tomorrow) r.fuDue++;
        if (next instanceof Date && now - next > DAY) r.fuOverdue++;
      }
      var rep = x[lc['Replied At']], fu1 = x[lc['Follow-up 1 Sent']];
      if (rep instanceof Date && fu1 instanceof Date && rep > fu1) {
        r.fuRepliesAll++;
        if (rep >= since) r.fuReplies24++;
      }
      var imp = x[lc['Imported At']];
      if (imp instanceof Date && imp >= since) r.imported24++;
      var c = replyCategory_(x, lc);
      if (c === 'need') r.needOutcome++;
      if (c === 'follow') r.followUp++;
      var oc = String(x[lc['Outcome']] || '').trim();
      if (oc === 'Interested') r.interested++;
      if (oc === 'Meeting booked' || oc === 'Customer') r.meetings++;
    });
  }

  // Gmails, and the day's standard: what the active Gmails may send today (or the Settings value).
  var dayIdx = dayIndex_(st.start, now, tz);
  var capacity = 0;
  var ib = ss.getSheetByName(SHEET.INBOXES);
  var ic = colMap_(ib);
  var ibv = ib.getLastRow() > 1 ? ib.getRange(2, 1, ib.getLastRow() - 1, ib.getLastColumn()).getValues() : [];
  inboxRows_(ss).forEach(function (i) {
    var row = ibv[i.row - 2];
    var connected = /^yes/i.test(String(row[ic['Connected']] || ''));
    var last = row[ic['Last Run']];
    var running = last instanceof Date && now - last < STUCK_HOURS * 3600000;
    var active = isActive_(i.status);
    if (active) capacity += dailyLimitFor_(i.limit || st.dailyLimit, rampFor_(st, i), dayIdx);
    var state = !connected ? 'Not connected' : !active ? i.status : !running ? 'Not running' : 'Sending';
    r.inboxes.push({ email: i.email, state: state });
  });
  r.connected = r.inboxes.filter(function (i) { return i.state !== 'Not connected'; }).length;
  r.activeInboxes = r.inboxes.filter(function (i) { return i.state === 'Sending'; }).length;
  r.standard = st.standard > 0 ? st.standard : capacity;
  r.met = r.standard > 0 && r.sent24 >= r.standard;

  if (r.fuOverdue) r.problems.push(r.fuOverdue + ' follow-up(s) more than a day late: the Gmail that sent their first email may have stopped (Inboxes -> Last Run, Last Result).');
  // Why it fell short (only shown when it did)
  if (!r.met) {
    if (st.paused) r.problems.push('Sending is paused (Settings -> Pause everything).');
    if (!r.waiting) r.problems.push('No new leads waiting: upload more leads.');
    else if (r.waiting < r.standard) r.problems.push('Only ' + r.waiting + ' new leads waiting: not enough for a full day (' + r.standard + ').');
    if (!r.inboxes.length) r.problems.push('No Gmail connected.');
    r.inboxes.forEach(function (i) { if (i.state !== 'Sending') r.problems.push(i.email + ': ' + i.state + '.'); });
    if (r.problems.length === (r.fuOverdue ? 1 : 0)) r.problems.push('Gmails and leads look fine: it may still be catching up (warm-up, send window, or follow-ups not due).');
  }

  // Goal
  r.goal = st.goal;
  r.delivered = Math.max(0, r.sentAll - r.bouncesAll);
  r.progress = r.goal ? Math.min(1, r.delivered / r.goal) : 0;
  var daysLeft = Math.max(0, Math.round((st.start.getTime() + st.length * DAY - now.getTime()) / DAY));
  r.daysLeft = daysLeft;
  r.perDay = daysLeft ? Math.ceil(Math.max(0, r.goal - r.delivered) / daysLeft) : Math.max(0, r.goal - r.delivered);
  r.bounce24 = r.sent24 ? r.bounces24 / r.sent24 : 0;
  r.bounceAll = r.sentAll ? r.bouncesAll / r.sentAll : 0;
  return r;
}

// The report as plain text, to paste into WhatsApp or an email.
function reportText_(r) {
  var p = function (x) { return (100 * x).toFixed(1) + '%'; };
  var lines = [
    '📊 ' + r.campaign + ': last 24 hours',
    r.from + ' → ' + r.made,
    '',
    'LAST 24 HOURS',
    '• Sent: ' + r.sent24 + ' (' + r.first24 + ' first emails, ' + r.fu24 + ' follow-ups)',
    '• Daily standard: ' + r.standard + ' → ' + (r.met ? '✅ met' : '❌ not met (' + (r.standard - r.sent24) + ' short)'),
    '• Replies: ' + r.replies24,
    '• Bounces: ' + r.bounces24 + ' (' + p(r.bounce24) + ')',
    '• New leads uploaded: ' + r.imported24,
    '• New leads waiting: ' + r.waiting
  ];
  lines = lines.concat(['', 'FOLLOW-UPS',
    '• Sent in 24 hours: ' + r.fu24 + ' (all time: ' + r.fuAll + ')',
    '• Due today: ' + r.fuDue + '   · Overdue: ' + r.fuOverdue,
    '• Replies after a follow-up: ' + r.fuReplies24 + ' in 24 hours (' + r.fuRepliesAll + ' all time)',
    '• Waiting for a follow-up: ' + r.inSeq]);
  if (r.problems.length) lines = lines.concat(['', r.met ? 'TO CHECK' : 'WHY IT FELL SHORT']).concat(r.problems.map(function (x) { return '• ' + x; }));
  return lines.concat([
    '',
    'CAMPAIGN SO FAR',
    '• Goal: ' + r.delivered + ' of ' + r.goal + ' delivered (' + p(r.progress) + ')' +
      (r.daysLeft ? ', ' + r.daysLeft + ' days left, ' + r.perDay + ' a day needed' : ''),
    '• Total sent: ' + r.sentAll,
    '• Total replies: ' + r.repliesAll,
    '• Total bounces: ' + r.bouncesAll + ' (' + p(r.bounceAll) + ')',
    '• Gmails: ' + r.connected + ' connected, ' + r.activeInboxes + ' sending',
    '• Replies needing an outcome: ' + r.needOutcome,
    '• To follow up: ' + r.followUp + '   · Interested: ' + r.interested + '   · Meetings: ' + r.meetings
  ]).join('\n');
}

function reportHtml_(T, r) {
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var p = function (x) { return (100 * x).toFixed(1) + '%'; };
  var tile = function (label, value, sub, tone) {
    return '<div class="tile' + (tone ? ' ' + tone : '') + '"><small>' + esc(label) + '</small><b>' + esc(value) + '</b>' +
      (sub ? '<i>' + esc(sub) + '</i>' : '') + '</div>';
  };
  var bad = r.met ? '' : 'bad';
  return '<style>body{font-family:Arial,sans-serif;margin:0;padding:0 10px;color:#1D2333}' +
    '.band{background:' + T.navy + ';color:' + T.onNavy + ';border-bottom:3px solid ' + T.gold + ';padding:12px 16px;border-radius:6px}' +
    '.band b{font-size:18px}.band div{color:' + T.gold2 + ';font-size:12px;margin-top:3px}' +
    'h3{margin:16px 0 6px;font-size:13px;letter-spacing:.06em;color:' + T.strong + ';border-bottom:2px solid ' + T.gold + ';padding-bottom:4px}' +
    '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}' +
    '.tile{background:#fff;border:1px solid ' + T.line + ';border-top:3px solid ' + T.gold + ';border-radius:6px;padding:8px;text-align:center}' +
    '.tile small{display:block;font-size:10px;font-weight:bold;color:' + T.muted + ';text-transform:uppercase}' +
    '.tile b{display:block;font-size:28px;color:' + T.strong + ';margin:2px 0}.tile i{font-style:normal;font-size:11px;color:#666}' +
    '.tile.good{border-top-color:' + T.good + '}.tile.good b{color:' + T.good + '}.tile.bad{border-top-color:' + T.bad + '}.tile.bad b{color:' + T.bad + '}' +
    '.why{background:#FCEDEB;border-left:4px solid ' + T.bad + ';padding:8px 12px;border-radius:4px;font-size:13px;margin-top:8px}.why li{margin:3px 0}' +
    '.track{height:12px;background:' + T.track + ';border-radius:6px;overflow:hidden;margin:6px 0 2px}.track i{display:block;height:100%;background:' + T.gold + '}' +
    '.btn{background:' + T.navy + ';color:' + T.onNavy + ';border:2px solid ' + T.gold + ';border-radius:4px;padding:9px 18px;font-weight:bold;cursor:pointer}' +
    'textarea{position:absolute;left:-9999px}#msg{margin-left:10px;color:' + T.good + ';font-size:12px}</style>' +
    '<div class="band"><b>📊 ' + esc(r.campaign) + '</b><div>Last 24 hours: ' + esc(r.from) + ' → ' + esc(r.made) + '   ·   ' + esc(r.by) + '</div></div>' +
    '<h3>LAST 24 HOURS</h3><div class="grid">' +
    tile('Sent', r.sent24, r.first24 + ' first · ' + r.fu24 + ' follow-ups', bad || 'good') +
    tile('Daily standard', r.standard, r.met ? '✅ Met' : '❌ ' + (r.standard - r.sent24) + ' short', bad || 'good') +
    tile('Replies', r.replies24, '') +
    tile('Bounces', r.bounces24, p(r.bounce24) + ' of sent', r.bounce24 > 0.03 ? 'bad' : '') +
    '</div><div class="grid" style="margin-top:8px">' +
    tile('New leads waiting', r.waiting, 'on the ground now', !r.met && r.waiting < r.standard ? 'bad' : '') +
    tile('Leads uploaded', r.imported24, 'in the last 24 hours') +
    tile('Need an outcome', r.needOutcome, 'replies not marked yet', r.needOutcome ? 'bad' : '') +
    tile('To follow up', r.followUp, r.interested + ' interested') +
    '</div>' +
    '<h3>FOLLOW-UPS</h3><div class="grid">' +
    tile('Sent (24 hours)', r.fu24, 'all time: ' + r.fuAll) +
    tile('Due today', r.fuDue, r.inSeq + ' waiting in total') +
    tile('Overdue', r.fuOverdue, 'more than a day late', r.fuOverdue ? 'bad' : 'good') +
    tile('Replies after a follow-up', r.fuReplies24, r.fuRepliesAll + ' all time') +
    '</div>' +
    (!r.problems.length ? '' : '<div class="why"><b>' + (r.met ? 'To check' : 'Why it fell short') + '</b><ul>' + r.problems.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>') +
    '<h3>CAMPAIGN SO FAR</h3>' +
    '<div style="font-size:13px"><b>Goal:</b> ' + r.delivered + ' of ' + r.goal + ' delivered (' + p(r.progress) + ')' +
    (r.daysLeft ? ' · ' + r.daysLeft + ' days left · ' + r.perDay + ' a day needed' : '') + '</div>' +
    '<div class="track"><i style="width:' + Math.round(100 * r.progress) + '%"></i></div>' +
    '<div class="grid" style="margin-top:8px">' +
    tile('Total sent', r.sentAll, '') +
    tile('Total replies', r.repliesAll, r.meetings + ' meetings') +
    tile('Total bounces', r.bouncesAll, p(r.bounceAll), r.bounceAll > 0.03 ? 'bad' : '') +
    tile('Gmails', r.connected, r.activeInboxes + ' sending now', r.activeInboxes < r.connected ? 'bad' : '') +
    '</div>' +
    '<p style="margin-top:14px"><button class="btn" onclick="copy()">Copy as text (WhatsApp / email)</button><span id="msg"></span></p>' +
    '<textarea id="txt">' + esc(reportText_(r)) + '</textarea>' +
    '<script>function copy(){var t=document.getElementById("txt");t.select();var ok=false;try{ok=document.execCommand("copy");}catch(e){}' +
    'if(!ok&&navigator.clipboard){navigator.clipboard.writeText(t.value).then(function(){m("Copied.");},function(){m("Select and copy: the text could not be copied automatically.");});return;}' +
    'm(ok?"Copied. Paste it into WhatsApp or an email.":"Could not copy automatically.");}function m(s){document.getElementById("msg").textContent=s;}</script>';
}

// ---------------------------------------------------------------- admin: own numbers on the Leaderboard

// Admin -> Leaderboard: add or remove my own numbers. Uses the loader's spare slot 8.
function slot8() {
  askAllPermissions_();
  if (notAdmin_()) return;
  var props = PropertiesService.getScriptProperties();
  var on = props.getProperty('BOARD_ME') === 'on';
  var ui = ui_();
  if (!on) {
    var name = props.getProperty('BOARD_ME_NAME') || '';
    if (ui) {
      var a = ui.prompt('Add your own numbers to the Leaderboard',
        'What name should show for you? (e.g. "Simeon (admin)")' + (name ? '\nLeave empty to keep "' + name + '".' : ''),
        ui.ButtonSet.OK_CANCEL);
      if (a.getSelectedButton() !== ui.Button.OK) return;
      name = a.getResponseText().trim() || name;
    }
    props.setProperties({ BOARD_ME: 'on', BOARD_ME_NAME: name || 'Admin (me)' });
  } else {
    props.setProperty('BOARD_ME', 'off');
  }
  alert_((on ? 'Your own numbers are now OFF the Leaderboard.' : 'Your own numbers are now ON the Leaderboard.') +
    '\n\n' + refreshTeam_() + '\n\nReload the sheet to see the new menu label.');
}

function boardIncludesMe_() {
  try { return PropertiesService.getScriptProperties().getProperty('BOARD_ME') === 'on'; } catch (e) { return false; }
}

// ---------------------------------------------------------------- admin: watch team sheets
// For the admin's own master sheet. Each team member shares their master sheet with the
// admin (Viewer is enough). The admin pastes the links into the Team tab. The script reads
// their raw data (not their Dashboard), compares it with the last check, and flags changes.
// The history lives in the admin's sheet, so team members cannot change it.

var TEAM = { OVERVIEW: 'Team', ALERTS: 'Team Alerts', HISTORY: 'Team History' };
var TEAM_HEADERS = ['Name', 'Sheet link', 'Status', 'Problems now', 'Red alerts (7 days)',
  'Sent today', 'Sent (7 days)', 'Total sent', 'Bounce %', 'Replies', 'Reply %', 'Meetings',
  'Leads waiting', 'Active Gmails', 'Last email sent', 'Last checked', 'Their dashboard'];
var TEAM_ALERT_HEADERS = ['Found At', 'Name', 'Level', 'What happened', 'How to check', 'Sheet ID'];
var TEAM_HISTORY_HEADERS = ['Checked At', 'Name', 'Leads', 'Waiting', 'Total Sent', 'Log Rows',
  'Log Sends', 'Replies', 'Bounced', 'Do Not Contact', 'Status', 'Sheet ID', 'Snapshot'];
var HOW_VERSION = 'Open their sheet -> File -> Version history -> See version history. It shows who changed what, and you can restore it.';
var HOW_REPAIR = 'If they have an older copy of the script, paste the latest Code.gs and click Set up / repair. Otherwise: ' + HOW_VERSION;

// True when the Gmail running this is listed in ADMINS (or ADMINS is still empty).
function isAdmin_() {
  var list = String(ADMINS || '').split(/[\s,;]+/).map(normEmail_).filter(String);
  return !list.length || list.indexOf(me_()) >= 0;
}

function notAdmin_() {
  if (isAdmin_()) return false;
  alert_('Only the admin can use this. Ask your admin if you need to see the team overview.');
  return true;
}

function addTeamSheet() {
  askAllPermissions_();
  if (notAdmin_()) return;
  var ui = SpreadsheetApp.getUi();
  var ss = ss_();
  teamSetup_(ss);
  var a = ui.prompt('Add a team member', 'Their name (e.g. "Sarah"):', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK || !a.getResponseText().trim()) return;
  var b = ui.prompt('Add ' + a.getResponseText().trim(),
    'Paste the link to THEIR master sheet.\n\nThey must share it with you first (Share -> add your Gmail -> Viewer).',
    ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK || !b.getResponseText().trim()) return;
  var sh = ss.getSheetByName(TEAM.OVERVIEW);
  sh.getRange(lastFilledRow_(sh, 2) + 1, 1, 1, 2).setValues([[a.getResponseText().trim(), b.getResponseText().trim()]]);
  alert_(refreshTeam_());
}

function refreshTeam() { askAllPermissions_(); if (notAdmin_()) return; alert_(refreshTeam_()); }
function refreshTeamAuto() { if (isAdmin_()) refreshTeam_(); }

function teamAutoOn() {
  askAllPermissions_();
  if (notAdmin_()) return;
  teamAutoOff_();
  ScriptApp.newTrigger('refreshTeamAuto').timeBased().everyHours(2).create();
  alert_('Automatic checks are on. Every 2 hours the Team tab is updated and any changes are written to Team Alerts.');
}
function teamAutoOff() { if (notAdmin_()) return; teamAutoOff_(); alert_('Automatic checks are off.'); }
function teamAutoOff_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshTeamAuto') ScriptApp.deleteTrigger(t);
  });
}

function teamSetup_(ss) {
  var sh = ensureSheet_(ss, TEAM.OVERVIEW, TEAM_HEADERS);
  if (sh.getRange(1, 1).getNote() === '') {
    sh.getRange(1, 1).setNote('Type each team member\'s name in column A and the link to their master sheet in column B. ' +
      'Then click Outreach -> Admin -> Check all team sheets now. They must share their sheet with you (Viewer).');
    sh.getRange('A:B').setBackground('#fff8e1');
    sh.getRange(1, 1, 1, 2).setBackground('#ffe082');
    sh.setColumnWidth(2, 220);
    sh.setColumnWidth(4, 380);
    sh.getRange('D:D').setWrap(true);
    sh.setFrozenColumns(1);
    styleDataTab_(sh, { hideGrid: true });
  }
  ensureSheet_(ss, TEAM.ALERTS, TEAM_ALERT_HEADERS).setColumnWidth(4, 420);
  ensureSheet_(ss, TEAM.HISTORY, TEAM_HISTORY_HEADERS);
  // Only the owner of this sheet can change the alert history, even if others can edit the sheet.
  [TEAM.ALERTS, TEAM.HISTORY].forEach(function (name) {
    var t = ss.getSheetByName(name);
    if (!t.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
      try {
        var p = t.protect().setDescription('Only the admin can change this');
        p.removeEditors(p.getEditors());
        if (p.canDomainEdit()) p.setDomainEdit(false);
      } catch (e) { /* not the owner: leave as is */ }
    }
  });
}

function refreshTeam_() {
  var ss = ss_();
  teamSetup_(ss);
  var sh = ss.getSheetByName(TEAM.OVERVIEW);
  var tc = colMap_(sh);
  var n = lastFilledRow_(sh, 2);
  if (n < 2) return 'Add a team member first: type their name in column A of the Team tab and the link to their sheet in column B.';
  var width = sh.getLastColumn();
  var rows = sh.getRange(2, 1, n - 1, width).getValues();
  var hist = ss.getSheetByName(TEAM.HISTORY);
  var alertsSh = ss.getSheetByName(TEAM.ALERTS);
  var prevMap = lastTeamSnapshots_(hist);
  var now = new Date();
  var todayStart = startOfToday_(ss);
  var histRows = [], alertRows = [];
  var counts = { ok: 0, check: 0, problem: 0 };
  var board = [];

  rows.forEach(function (r) {
    var name = String(r[tc['Name']]).trim();
    var link = String(r[tc['Sheet link']]).trim();
    if (!link) return;
    var id = (link.match(/[-\w]{25,}/) || [])[0] || link;
    var prev = prevMap[id] || null;
    var res, dash = '';
    try {
      var book = SpreadsheetApp.openById(id);
      res = analyzeTeam_(readTeamData_(book), prev, now, todayStart);
      var d = book.getSheetByName(SHEET.DASH);
      dash = '=HYPERLINK("' + book.getUrl() + (d ? '#gid=' + d.getSheetId() : '') + '","Open")';
    } catch (e) {
      res = { stats: null, snapshot: prev, flags: [{ level: 'red', key: 'access',
        text: 'Cannot open this sheet: access was removed or the link is wrong.',
        how: 'Ask them to share their master sheet with you again (Viewer).' }] };
    }
    var known = (prev && prev.flags) || [];
    res.flags.forEach(function (f) {
      if (known.indexOf(f.key) < 0) alertRows.push([now, name, f.level === 'red' ? '🔴 Red' : '🟡 Check', f.text, f.how || '', id]);
    });
    var status = teamStatus_(res.flags);
    if (res.stats) board.push({ name: name || '(no name)', stats: res.stats, status: status });
    counts[status === '🟢 OK' ? 'ok' : status === '🟡 Check' ? 'check' : 'problem']++;
    var set = function (h, v) { if (tc[h] !== undefined) r[tc[h]] = v; };
    set('Status', status);
    set('Problems now', res.flags.map(function (f) { return (f.level === 'red' ? '🔴 ' : '🟡 ') + f.text; }).join('\n') || 'None');
    set('Last checked', now);
    if (res.stats) {
      var t = res.stats;
      set('Sent today', t.sentToday); set('Sent (7 days)', t.sent7); set('Total sent', t.totalSent);
      set('Bounce %', t.bouncePct); set('Replies', t.replies); set('Reply %', t.replyPct);
      set('Meetings', t.meetings); set('Leads waiting', t.waiting);
      set('Active Gmails', t.activeInboxes + ' of ' + t.inboxes);
      set('Last email sent', t.lastSent || 'Never');
      set('Their dashboard', dash);
      var snap = res.snapshot;
      snap.flags = res.flags.map(function (f) { return f.key; });
      histRows.push([now, name, snap.leads, snap.waiting, snap.totalSent, snap.logRows, snap.logSends,
        snap.replies, snap.bounced, snap.dnc, status, id, JSON.stringify(snap)]);
    } else {
      var keep = prev ? JSON.parse(JSON.stringify(prev)) :
        { leads: 0, waiting: 0, totalSent: 0, logRows: 0, logSends: 0, replies: 0, bounced: 0, dnc: 0 };
      keep.flags = res.flags.map(function (f) { return f.key; });
      histRows.push([now, name, keep.leads, keep.waiting, keep.totalSent, keep.logRows, keep.logSends,
        keep.replies, keep.bounced, keep.dnc, status, id, JSON.stringify(keep)]);
    }
    r.__id = id;
  });

  // The admin's own numbers, when switched on (Admin -> Leaderboard: my own numbers).
  if (boardIncludesMe_()) {
    try {
      var mine = analyzeTeam_(readTeamData_(ss), null, now, todayStart);
      board.push({ name: '⭐ ' + (PropertiesService.getScriptProperties().getProperty('BOARD_ME_NAME') || 'Admin (me)'),
                   stats: mine.stats, status: teamStatus_(mine.flags) });
    } catch (e) { console.log('Own numbers: ' + e.message); }
  }

  if (alertRows.length) alertsSh.getRange(alertsSh.getLastRow() + 1, 1, alertRows.length, alertRows[0].length).setValues(alertRows);
  if (histRows.length) hist.getRange(hist.getLastRow() + 1, 1, histRows.length, histRows[0].length).setValues(histRows);

  // red alerts in the last 7 days, per sheet
  var reds = {};
  if (alertsSh.getLastRow() > 1) {
    var ac = colMap_(alertsSh);
    alertsSh.getRange(2, 1, alertsSh.getLastRow() - 1, alertsSh.getLastColumn()).getValues().forEach(function (a) {
      var at = a[ac['Found At']];
      if (at instanceof Date && now - at < 7 * 86400000 && String(a[ac['Level']]).indexOf('Red') >= 0) {
        reds[a[ac['Sheet ID']]] = (reds[a[ac['Sheet ID']]] || 0) + 1;
      }
    });
  }
  rows.forEach(function (r) { if (r.__id && tc['Red alerts (7 days)'] !== undefined) r[tc['Red alerts (7 days)']] = reds[r.__id] || 0; });

  sh.getRange(2, 1, rows.length, width).setValues(rows.map(function (r) { return r.slice(0, width); }));
  sh.getRange(2, tc['Bounce %'] + 1, rows.length, 1).setNumberFormat('0.0%');
  sh.getRange(2, tc['Reply %'] + 1, rows.length, 1).setNumberFormat('0.0%');
  sh.getRange(2, tc['Last email sent'] + 1, rows.length, 2).setNumberFormat('yyyy-mm-dd hh:mm');
  try { buildLeaderboard_(ss, board, now); } catch (e) { console.log('Leaderboard: ' + e.message); }
  return 'Checked ' + (counts.ok + counts.check + counts.problem) + ' team sheets: ' +
    counts.ok + ' OK, ' + counts.check + ' to check, ' + counts.problem + ' with problems.\n\n' +
    (alertRows.length ? alertRows.length + ' new alerts were added to the Team Alerts tab.' : 'No new alerts.') +
    '\n\nThe Leaderboard tab is updated.';
}

// One tab that ranks everyone: most emails sent first, then most replies.
function buildLeaderboard_(ss, board, now) {
  loadTheme_(ss);
  var T = THEME;
  var sh = ss.getSheetByName('Leaderboard');
  if (!sh) {
    var team = ss.getSheetByName(TEAM.OVERVIEW);
    sh = ss.insertSheet('Leaderboard', team ? team.getIndex() : 0);
  }
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.clear();
  try { sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart(); } catch (e) { /* nothing merged */ }
  sh.setHiddenGridlines(true);
  sh.setTabColor(T.gold);
  var heads = ['Rank', 'Name', 'Leads', 'Sent today', 'Sent (7 days)', 'Total sent', 'Replies', 'Reply %',
               'Bounces', 'Bounce %', 'Meetings', 'Need outcome', 'To follow up', 'Follow-ups sent', 'Follow-ups today',
               'Follow-ups late', 'Replies after follow-up', 'Status'];
  var W = heads.length;
  var widths = [70, 200, 90, 100, 110, 110, 90, 90, 90, 90, 100, 110, 110, 120, 120, 120, 150, 130];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  board.sort(function (a, b) {
    return (b.stats.totalSent - a.stats.totalSent) || (b.stats.replies - a.stats.replies);
  });
  var medal = ['🥇 1', '🥈 2', '🥉 3'];
  var rows = board.map(function (e, i) {
    var t = e.stats;
    return [medal[i] || String(i + 1), e.name, t.leads || 0, t.sentToday, t.sent7, t.totalSent, t.replies,
            t.replyPct, t.bounced || 0, t.bouncePct, t.meetings, t.needOutcome || 0, t.followUp || 0,
            t.fuSent || 0, t.fuToday || 0, t.fuOverdue || 0, t.fuReplies || 0, e.status];
  });
  var sum = function (k) { return board.reduce(function (s, e) { return s + (Number(e.stats[k]) || 0); }, 0); };
  var emailed = sum('emailed');
  var totals = ['', 'TEAM TOTAL', sum('leads'), sum('sentToday'), sum('sent7'), sum('totalSent'), sum('replies'),
                emailed ? sum('replies') / emailed : 0, sum('bounced'), emailed ? sum('bounced') / emailed : 0,
                sum('meetings'), sum('needOutcome'), sum('followUp'), sum('fuSent'), sum('fuToday'), sum('fuOverdue'),
                sum('fuReplies'), board.length + ' people'];

  sh.getRange(1, 1, 2, W).setBackground(T.navy);
  sh.setRowHeight(1, 44); sh.setRowHeight(2, 26);
  sh.getRange(1, 1, 1, W).merge().setValue('  🏆  Leaderboard').setFontFamily(T.head).setFontSize(22)
    .setFontWeight('bold').setFontColor(T.onNavy).setVerticalAlignment('bottom');
  sh.getRange(2, 1, 1, W).merge().setValue('   Updated ' + Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'EEE d MMM yyyy, HH:mm') +
    '   ·   ranked by total emails sent, then replies   ·   ' + BRAND.name)
    .setFontColor(T.gold2).setFontSize(9).setFontWeight('bold').setVerticalAlignment('top');
  sh.getRange(3, 1, 1, W).setBackground(T.gold);
  sh.setRowHeight(3, 4);

  sh.getRange(4, 1, 1, W).setValues([heads]).setBackground(T.navy2).setFontColor(T.onNavy).setFontWeight('bold')
    .setFontSize(9).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(4, 30);
  if (rows.length) {
    var body = sh.getRange(5, 1, rows.length, W);
    body.setValues(rows).setFontFamily(T.body).setFontSize(11).setHorizontalAlignment('center').setVerticalAlignment('middle');
    sh.getRange(5, 2, rows.length, 1).setHorizontalAlignment('left').setFontWeight('bold').setFontColor(T.strong);
    sh.getRange(5, 6, rows.length, 1).setFontWeight('bold');
    for (var i = 0; i < rows.length; i++) {
      sh.setRowHeight(5 + i, 30);
      sh.getRange(5 + i, 1, 1, W).setBackground(i < 3 ? ['#F6E7B8', '#EEF0F4', '#F3E3D3'][i] : (i % 2 ? T.ivory : '#FFFFFF'));
    }
    sh.getRange(5, 8, rows.length + 1, 1).setNumberFormat('0.0%');
    sh.getRange(5, 10, rows.length + 1, 1).setNumberFormat('0.0%');
    sh.getRange(5, 3, rows.length + 1, 5).setNumberFormat('#,##0');
  }
  var tr = 5 + rows.length;
  sh.getRange(tr, 1, 1, W).setValues([totals]).setBackground(T.navy).setFontColor(T.gold2).setFontWeight('bold')
    .setFontFamily(T.body).setFontSize(11).setHorizontalAlignment('center')
    .setBorder(true, null, null, null, null, null, T.gold, SpreadsheetApp.BorderStyle.SOLID_THICK);
  sh.setRowHeight(tr, 32);
  sh.getRange(tr + 2, 1, 1, W).merge().setValue(BRAND.credit).setFontFamily(T.head).setFontStyle('italic')
    .setFontColor(T.muted).setHorizontalAlignment('right');
  sh.setFrozenRows(4);
}

function teamStatus_(flags) {
  if (flags.some(function (f) { return f.level === 'red'; })) return '🔴 Problem';
  return flags.length ? '🟡 Check' : '🟢 OK';
}

// The most recent snapshot for each sheet, from the Team History tab.
function lastTeamSnapshots_(hist) {
  var map = {};
  if (hist.getLastRow() < 2) return map;
  var hc = colMap_(hist);
  hist.getRange(2, 1, hist.getLastRow() - 1, hist.getLastColumn()).getValues().forEach(function (r) {
    try { map[r[hc['Sheet ID']]] = JSON.parse(r[hc['Snapshot']]); } catch (e) { /* skip */ }
  });
  return map;
}

function readTeamData_(book) {
  var get = function (name) { var sh = book.getSheetByName(name); return sh ? sh.getDataRange().getValues() : null; };
  return { leads: get(SHEET.LEADS), log: get(SHEET.LOG), inboxes: get(SHEET.INBOXES),
           settings: get(SHEET.SETTINGS), dnc: get(SHEET.DNC), dashboard: !!book.getSheetByName(SHEET.DASH) };
}

// Works out a team member's numbers from their raw tabs and flags anything that looks changed.
// d: the tab values, prev: the last snapshot (or null), now / todayStart: Dates.
function analyzeTeam_(d, prev, now, todayStart) {
  var flags = [];
  var add = function (level, key, text, how) { flags.push({ level: level, key: key, text: text, how: how || '' }); };
  var idx = function (header) { var m = {}; (header || []).forEach(function (h, i) { if (h !== '') m[String(h)] = i; }); return m; };
  var day = 86400000;

  var missingTabs = [['leads', SHEET.LEADS], ['log', SHEET.LOG], ['inboxes', SHEET.INBOXES],
    ['settings', SHEET.SETTINGS], ['dnc', SHEET.DNC], ['dashboard', SHEET.DASH]]
    .filter(function (t) { return !d[t[0]]; }).map(function (t) { return t[1]; });
  if (missingTabs.length) add('red', 'tabs', 'Tab deleted or renamed: ' + missingTabs.join(', '), HOW_VERSION);

  // Leads
  var leads = d.leads || [[]];
  var lh = idx(leads[0]);
  if (d.leads) {
    var missingCols = LEAD_HEADERS.filter(function (h) { return lh[h] === undefined; });
    if (missingCols.length) add('red', 'cols', 'Leads columns deleted or renamed: ' + missingCols.join(', '), HOW_REPAIR);
  }
  var s = { leads: 0, waiting: 0, totalSent: 0, emailed: 0, replies: 0, bounced: 0, meetings: 0,
            resetToNew: 0, handReplied: 0, dupes: 0, needOutcome: 0, followUp: 0, fuOverdue: 0, fuReplies: 0 };
  var seen = {};
  for (var r = 1; r < leads.length; r++) {
    var row = leads[r];
    var email = normEmail_(row[lh['Email']]);
    if (!email) continue;
    s.leads++;
    if (seen[email]) s.dupes++;
    seen[email] = true;
    var status = String(row[lh['Status']] || '').trim();
    var sent = emailsSent_(row, lh);
    s.totalSent += sent;
    if (sent > 0) s.emailed++;
    if (status === STATUS.NEW) {
      s.waiting++;
      if (sent > 0 || row[lh['Email 1 Sent']]) s.resetToNew++;
    }
    var repliedAt = row[lh['Replied At']];
    if (status === STATUS.REPLIED || repliedAt) s.replies++;
    if (status === STATUS.REPLIED && !repliedAt) s.handReplied++;
    if (status === STATUS.BOUNCED) s.bounced++;
    var oc = String(row[lh['Outcome']] || '');
    if (oc === 'Meeting booked' || oc === 'Customer') s.meetings++;
    var nx = row[lh['Next Send']], f1 = row[lh['Follow-up 1 Sent']];
    if (status === STATUS.ACTIVE && nx instanceof Date && now - nx > day) s.fuOverdue++;
    if (repliedAt instanceof Date && f1 instanceof Date && repliedAt > f1) s.fuReplies++;
    var rc = replyCategory_(row, lh);
    if (rc === 'need') s.needOutcome++;
    if (rc === 'follow') s.followUp++;
  }

  // Log
  var log = d.log || [[]];
  var gh = idx(log[0]);
  var logRows = 0, logSends = 0, sentToday = 0, sent7 = 0, lastSent = null, fuSent = 0, fuToday = 0;
  for (var i = 1; i < log.length; i++) {
    var ev = String(log[i][gh['Event']] || '');
    var ts = log[i][gh['Timestamp']];
    if (!ev && !ts) continue;
    logRows++;
    if (SENT_EVENTS.indexOf(ev) < 0) continue;
    logSends++;
    if (ev !== 'SENT_1') { fuSent++; if (ts instanceof Date && ts >= todayStart) fuToday++; }
    if (ts instanceof Date) {
      if (ts >= todayStart) sentToday++;
      if (now - ts < 7 * day) sent7++;
      if (!lastSent || ts > lastSent) lastSent = ts;
    }
  }

  // Inboxes
  var ibv = d.inboxes || [[]];
  var ih = idx(ibv[0]);
  var inboxes = 0, active = 0, redHealth = 0, highLimit = [], noWarm = [];
  for (var j = 1; j < ibv.length; j++) {
    if (!isValidEmail_(normEmail_(ibv[j][ih['Inbox Email']]))) continue;
    inboxes++;
    if (isActive_(ibv[j][ih['Status']])) active++;
    if (ih['Warm-up Day 1'] !== undefined && String(ibv[j][ih['Warm-up Day 1']]) !== '' &&
        Number(ibv[j][ih['Warm-up Day 1']]) === 0) noWarm.push(normEmail_(ibv[j][ih['Inbox Email']]));
    if (Number(ibv[j][ih['Daily Limit']]) > SAFE_LIMIT) highLimit.push(normEmail_(ibv[j][ih['Inbox Email']]) + ' (' + Number(ibv[j][ih['Daily Limit']]) + ')');
    if (String(ibv[j][ih['Health']] || '').indexOf('🔴') >= 0) redHealth++;
  }

  // Do Not Contact
  var dnc = (d.dnc || [[]]).slice(1).filter(function (x) { return String(x[0]).trim() !== ''; }).length;

  // Settings
  var st = settingsFromValues_(d.settings || []);
  if (d.settings) {
    var labels = {};
    d.settings.forEach(function (x) { labels[String(x[0]).trim()] = true; });
    var gone = SETTINGS_DEF.filter(function (x) { return !labels[x.label] && !x.added && x.key !== 'theme' && x.key !== 'layout'; }).map(function (x) { return x.label; });
    if (gone.length) add('red', 'settingsRows', 'Settings rows deleted or renamed: ' + gone.join(', '), HOW_REPAIR);
    if (st.dailyLimit > SAFE_LIMIT) add('yellow', 'limit', 'Default daily limit set to ' + st.dailyLimit + ' (above the safe ' + SAFE_LIMIT + ' for free Gmail)', 'Their Settings tab.');
    if (!st.rampStart) add('yellow', 'warmup', 'Warm-up turned off', 'Their Settings tab.');
    if (st.paused) add('yellow', 'paused', 'Sending is paused (Pause everything = TRUE)', 'Their Settings tab.');
    if (!st.optOut) add('yellow', 'optout', 'Opt-out line removed', 'Their Settings tab.');
    if (st.followUps === 0) add('yellow', 'nofu', 'Follow-ups turned off', 'Their Settings tab.');
    if (st.pace === 'Fast') add('yellow', 'fast', 'Sending pace set to Fast (Steady is safer for free Gmails)', 'Their Settings tab.');
  }

  // Changes since the last check
  if (prev) {
    if (s.leads < prev.leads) add('red', 'leadsDown:' + prev.leads + '>' + s.leads,
      (prev.leads - s.leads) + ' leads deleted since the last check (' + prev.leads + ' -> ' + s.leads + '). Expected only if they started a new campaign.', HOW_VERSION);
    if (logRows < prev.logRows) add('red', 'logDown:' + prev.logRows + '>' + logRows,
      (prev.logRows - logRows) + ' Log rows deleted since the last check', HOW_VERSION);
    if (s.totalSent < prev.totalSent) add('red', 'sentDown:' + prev.totalSent + '>' + s.totalSent,
      'Total sent went DOWN by ' + (prev.totalSent - s.totalSent) + ' (sent numbers edited, or emailed leads deleted)', HOW_VERSION);
    if (dnc < prev.dnc) add('red', 'dncDown:' + prev.dnc + '>' + dnc,
      (prev.dnc - dnc) + ' people removed from Do Not Contact (they could be emailed again)', HOW_VERSION);
  }

  // Leads and Log must agree
  var tol = Math.max(3, Math.round(0.02 * Math.max(logSends, s.totalSent)));
  if (d.leads && d.log) {
    if (logSends < s.totalSent - tol) add('red', 'logMissing',
      'The Log has ' + (s.totalSent - logSends) + ' fewer sends than the Leads tab: Log rows were deleted', HOW_VERSION);
    if (s.totalSent < logSends - tol) add('red', 'leadsMissing',
      'The Leads tab has ' + (logSends - s.totalSent) + ' fewer sends than the Log: emailed leads were deleted or reset', HOW_VERSION);
  }
  if (s.resetToNew) add('yellow', 'reset', s.resetToNew + ' leads were set back to New after being emailed (they will be emailed again)', 'Their Leads tab: filter Status = New, look at Emails Sent.');
  if (s.handReplied) add('yellow', 'handReplied', s.handReplied + ' leads marked Replied by hand (no reply was found by the system)', 'Their Leads tab: Status = Replied with an empty Replied At.');
  if (s.dupes) add('yellow', 'dupes', s.dupes + ' duplicate emails in Leads (added by hand)', 'Their Leads tab: sort by Email.');

  // Activity
  var bouncePct = s.emailed ? s.bounced / s.emailed : 0;
  if (bouncePct > 0.03 && s.emailed >= 20) add('yellow', 'bounces', 'Bounce rate ' + (bouncePct * 100).toFixed(1) + '% (keep under 2%): lists not checked before upload?', 'Their Leads tab: filter Status = Bounced.');
  if (d.inboxes && inboxes === 0) add('yellow', 'noInbox', 'No Gmail connected yet', 'Their Inboxes tab.');
  else if (d.inboxes && active === 0) add('yellow', 'noActive', 'All Gmails are paused', 'Their Inboxes tab: Status column.');
  if (noWarm.length) add('yellow', 'gmailWarm', 'Warm-up turned off for: ' + noWarm.join(', '), 'Their Inboxes tab: Warm-up Day 1 column.');
  if (highLimit.length) add('yellow', 'gmailLimit', 'Gmails with a daily limit above ' + SAFE_LIMIT + ': ' + highLimit.join(', '), 'Their Inboxes tab: Daily Limit column.');
  if (redHealth) add('yellow', 'health', redHealth + ' Gmail(s) paused for too many bounces', 'Their Inboxes tab: Health column.');
  var weekend = [0, 6].indexOf(now.getDay()) >= 0;
  if (!st.paused && active > 0 && s.waiting > 0 && !(weekend && !st.weekends) &&
      (!lastSent || now - lastSent > 26 * 3600000)) {
    add('yellow', 'idle', 'Nothing sent in the last 24 hours, but ' + s.waiting + ' leads are waiting', 'Their Inboxes tab: read Last Result.');
  }
  if (s.fuOverdue) add('yellow', 'fuOverdue', s.fuOverdue + ' follow-ups more than a day late (a Gmail may have stopped)', 'Their Inboxes tab: Last Run and Last Result.');
  if (d.leads && s.waiting === 0 && s.leads > 0 && !st.paused) add('yellow', 'empty', 'No leads waiting: they need to upload more', '');

  return {
    flags: flags,
    stats: { leads: s.leads, bounced: s.bounced, emailed: s.emailed,
             sentToday: sentToday, sent7: sent7, totalSent: s.totalSent, bouncePct: bouncePct,
             replies: s.replies, replyPct: s.emailed ? s.replies / s.emailed : 0, meetings: s.meetings,
             waiting: s.waiting, activeInboxes: active, inboxes: inboxes, lastSent: lastSent,
             needOutcome: s.needOutcome, followUp: s.followUp,
             fuSent: fuSent, fuToday: fuToday, fuOverdue: s.fuOverdue, fuReplies: s.fuReplies },
    snapshot: { leads: s.leads, waiting: s.waiting, totalSent: s.totalSent, logRows: logRows,
                logSends: logSends, replies: s.replies, bounced: s.bounced, dnc: dnc }
  };
}

function ss_() {
  if (MASTER_SHEET) {
    var id = (String(MASTER_SHEET).match(/[-\w]{25,}/) || [])[0];
    if (!id) throw new Error('MASTER_SHEET at the top of the script is not a valid sheet link or ID.');
    return SpreadsheetApp.openById(id);
  }
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { /* trigger context */ }
  if (!ss) {
    var saved = PropertiesService.getScriptProperties().getProperty('SSID');
    if (!saved) throw new Error('This script is not attached to a sheet. Paste the master sheet link into MASTER_SHEET at the top of the script.');
    ss = SpreadsheetApp.openById(saved);
  }
  return ss;
}

// The sheet's pop-up box, or null when running from a per-Gmail script copy.
function ui_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}

function me_() {
  return normEmail_(Session.getEffectiveUser().getEmail());
}

function colMap_(sh) {
  var map = {};
  sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .forEach(function (h, i) { if (h !== '') map[String(h)] = i; });
  return map;
}

function lastFilledRow_(sh, col) {
  var n = sh.getLastRow();
  if (n < 2) return 1;
  var v = sh.getRange(1, col, n, 1).getValues();
  for (var i = v.length - 1; i >= 0; i--) if (String(v[i][0]).trim() !== '') return i + 1;
  return 1;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// The lead's row number now (rows may have been sorted or moved since they were read), or -1.
function findLeadRow_(ld, lc, leadId, rowHint) {
  if (rowHint >= 2 && rowHint <= ld.getLastRow() &&
      String(ld.getRange(rowHint, lc['Lead ID'] + 1).getValue()) === String(leadId)) return rowHint;
  var ids = ld.getRange(2, lc['Lead ID'] + 1, Math.max(1, ld.getLastRow() - 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(leadId)) return i + 2;
  return -1;
}

// The lead's row as it is in the sheet right now: { row, values }, or null if it is gone.
function leadRowNow_(ld, lc, leadId, rowHint) {
  var row = findLeadRow_(ld, lc, leadId, rowHint);
  return row < 0 ? null : { row: row, values: ld.getRange(row, 1, 1, ld.getLastColumn()).getValues()[0] };
}

function updateLead_(ld, lc, leadId, rowHint, updates) {
  withLock_(function () {
    var row = findLeadRow_(ld, lc, leadId, rowHint);
    if (row < 0) return;
    // Side-by-side columns are written in one go (much faster than one cell at a time).
    var cols = Object.keys(updates).filter(function (h) { return lc[h] !== undefined; })
      .map(function (h) { return { c: lc[h], v: updates[h] }; })
      .sort(function (a, b) { return a.c - b.c; });
    for (var i = 0; i < cols.length;) {
      var j = i;
      while (j + 1 < cols.length && cols[j + 1].c === cols[j].c + 1) j++;
      ld.getRange(row, cols[i].c + 1, 1, j - i + 1)
        .setValues([cols.slice(i, j + 1).map(function (x) { return x.v; })]);
      i = j + 1;
    }
  });
}

function log_(ss, inbox, leadEmail, event, leadId, detail, threadId, msgId) {
  var lg = ss.getSheetByName(SHEET.LOG);
  withLock_(function () {
    lg.appendRow([new Date(), inbox || '', leadEmail || '', event, leadId || '',
      String(detail || '').slice(0, 500), threadId || '', msgId || '']);
  });
}

function readSettings_(ss) {
  var sh = ss.getSheetByName(SHEET.SETTINGS);
  if (!sh) throw new Error('Settings tab missing. Run Outreach -> 1. Set up this sheet.');
  return settingsFromValues_(sh.getRange(1, 1, sh.getLastRow(), 2).getValues());
}

// Reads settings from the Settings tab's rows (label in column A, value in column B).
function settingsFromValues_(values) {
  var byLabel = {};
  values.forEach(function (r) { byLabel[String(r[0]).trim()] = r[1]; });
  var s = {};
  SETTINGS_DEF.forEach(function (d) {
    s[d.key] = byLabel.hasOwnProperty(d.label) ? byLabel[d.label] : (d.value === 'TODAY' ? new Date() : d.value);
  });
  var num = function (v, dflt) { var n = Number(v); return v === '' || isNaN(n) ? dflt : n; };
  s.goal = num(s.goal, 5000);
  s.length = num(s.length, 11);
  s.dailyLimit = num(s.dailyLimit, 35);
  s.rampStart = s.rampStart === '' ? 0 : num(s.rampStart, 0);
  s.rampStep = num(s.rampStep, 0);
  s.followUps = Math.max(0, Math.min(2, num(s.followUps, 2)));
  s.fu1Days = num(s.fu1Days, 3);
  s.fu2Days = num(s.fu2Days, 4);
  s.startHour = num(s.startHour, 8);
  s.endHour = num(s.endHour, 18);
  s.minDelay = num(s.minDelay, 20);
  s.maxDelay = Math.max(s.minDelay, num(s.maxDelay, 60));
  s.bouncePause = num(s.bouncePause, 0.05);
  if (s.bouncePause > 1) s.bouncePause = s.bouncePause / 100;
  s.autoResume = s.autoResume === '' ? 0 : num(s.autoResume, 0);
  s.standard = s.standard === '' ? 0 : num(s.standard, 0);
  s.pace = /fast/i.test(String(s.pace)) ? 'Fast' : 'Steady';
  s.autoMove = toBool_(s.autoMove);
  s.weekends = toBool_(s.weekends);
  s.paused = toBool_(s.paused);
  s.optOut = String(s.optOut || '').trim();
  s.signature = String(s.signature || '').trim();
  s.defSubject = String(s.defSubject || '').trim();
  s.defFu1 = String(s.defFu1 || '').trim();
  s.defFu2 = String(s.defFu2 || '').trim();
  s.theme = String(s.theme || 'Navy & Gold').trim();
  s.layout = String(s.layout || 'Classic').trim();
  if (!(s.start instanceof Date)) s.start = s.start ? new Date(s.start) : new Date();
  return s;
}

// Reads the Inboxes tab by column name: one object per Gmail.
function inboxRows_(ss) {
  var ib = ss.getSheetByName(SHEET.INBOXES);
  if (!ib || ib.getLastRow() < 2) return [];
  var ic = colMap_(ib);
  var v = ib.getRange(2, 1, ib.getLastRow() - 1, ib.getLastColumn()).getValues();
  var out = [];
  v.forEach(function (r, i) {
    var email = normEmail_(r[ic['Inbox Email']]);
    if (!email) return;
    out.push({ row: i + 2, email: email, name: String(r[ic['Sender Name']] || '').trim(),
               limit: Number(r[ic['Daily Limit']]) || 0, status: String(r[ic['Status']] || 'Active').trim(),
               rampStart: optNum_(r[ic['Warm-up Day 1']]), rampStep: optNum_(r[ic['Warm-up Per Day']]) });
  });
  return out;
}

// A number typed in a cell, or null when the cell is empty (or the column does not exist).
function optNum_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

// The warm-up for one Gmail: its own Warm-up columns on Inboxes, or else the Settings warm-up.
function rampFor_(st, inbox) {
  return { rampStart: inbox && inbox.rampStart !== null && inbox.rampStart !== undefined ? inbox.rampStart : st.rampStart,
           rampStep: inbox && inbox.rampStep !== null && inbox.rampStep !== undefined ? inbox.rampStep : st.rampStep };
}

function isActive_(status) {
  return String(status || '').trim().toLowerCase() === 'active';
}

function isBouncePaused_(status) {
  return String(status || '').trim().toLowerCase() === 'paused - bounces';
}

function findInbox_(ss, email) {
  return inboxRows_(ss).filter(function (x) { return x.email === email; })[0] || null;
}

function allInboxes_(ss) {
  return inboxRows_(ss).map(function (x) { return x.email; });
}

function activeInboxes_(ss) {
  return inboxRows_(ss).filter(function (x) { return isActive_(x.status); })
    .map(function (x) { return x.email; });
}

function setInboxCell_(ss, row, header, value) {
  var ib = ss.getSheetByName(SHEET.INBOXES);
  var col = colMap_(ib)[header];
  if (col === undefined) return;
  withLock_(function () { ib.getRange(row, col + 1).setValue(value); });
}

function processedIds_(ss, me) {
  var lg = ss.getSheetByName(SHEET.LOG);
  var seen = {};
  if (lg.getLastRow() < 2) return seen;
  lg.getRange(2, 1, lg.getLastRow() - 1, 8).getValues().forEach(function (r) {
    if (normEmail_(r[1]) === me && r[7]) seen[String(r[7])] = true;
  });
  return seen;
}

function loadDnc_(ss) {
  var sh = ss.getSheetByName(SHEET.DNC);
  var set = {};
  if (!sh || sh.getLastRow() < 2) return set;
  sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .forEach(function (r) { var e = normEmail_(r[0]); if (e) set[e] = true; });
  return set;
}

function addDnc_(ss, email, reason) {
  var sh = ss.getSheetByName(SHEET.DNC);
  if (loadDnc_(ss)[email]) return;
  withLock_(function () { sh.appendRow([email, reason, new Date()]); });
}

function todayDate_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var p = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd').split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function startOfToday_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var hms = Utilities.formatDate(now, tz, 'H:m:s').split(':').map(Number);
  return new Date(now.getTime() - ((hms[0] * 60 + hms[1]) * 60 + hms[2]) * 1000 - now.getMilliseconds());
}

function dayIndex_(start, now, tz) {
  var a = Utilities.formatDate(start, tz, 'yyyy-MM-dd');
  var b = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function requireGmailService_() {
  if (typeof Gmail === 'undefined') {
    throw new Error('The Gmail API service is not added yet. In Extensions -> Apps Script, ' +
      'click the + next to "Services", choose "Gmail API", click Add, then try again.');
  }
}

function alert_(msg) {
  var ui = ui_();
  if (ui) ui.alert(msg); else console.log(msg); // shown in the Apps Script "Execution log"
}

function toast_(msg) {
  try { ss_().toast(msg, 'Outreach', 8); } catch (e) { console.log(msg); }
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ---------------------------------------------------------------- pure helpers (no Google calls)

function normEmail_(v) {
  return String(v === null || v === undefined ? '' : v).trim().toLowerCase()
    .replace(/^mailto:/, '').replace(/^<|>$/g, '');
}

function isValidEmail_(e) {
  return /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}$/i.test(e);
}

function isBlocked_(email, dnc) {
  if (dnc[email]) return true;
  var at = email.lastIndexOf('@');
  return at >= 0 && !!dnc[email.slice(at)];
}

function extractEmail_(s) {
  var m = String(s || '').match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : '';
}

function normHeader_(h) {
  return String(h || '').replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fieldKey_(h) {
  return String(h || '').replace(/^\uFEFF/, '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function mapHeaders_(headers) {
  var names = {
    email: ['email', 'emailaddress', 'workemail', 'businessemail', 'contactemail', 'mail', 'emails', 'primaryemail'],
    first: ['firstname', 'first', 'fname', 'givenname'],
    last: ['lastname', 'last', 'lname', 'surname', 'familyname'],
    full: ['name', 'fullname', 'contactname', 'contact', 'person'],
    company: ['company', 'companyname', 'organization', 'organisation', 'business', 'businessname', 'account', 'accountname', 'org'],
    subject: ['subject', 'subjectline', 'emailsubject', 'subject1'],
    message: ['message', 'body', 'emailbody', 'messagebody', 'emailmessage', 'email1', 'firstemail', 'email1body',
              'personalizedmessage', 'personalisedmessage', 'personalizedemail', 'personalisedemail',
              'emailcopy', 'emailcontent', 'outreachmessage', 'coldemail', 'message1', 'firstmessage',
              'initialemail', 'openingemail', 'email1message', 'mainmessage', 'firstemailmessage'],
    fu1: ['followup1', 'followup1message', 'followupmessage1', 'fu1', 'followup', 'followupmessage',
          'email2', 'secondemail', 'email2body', 'message2', 'firstfollowup', 'followupemail1',
          'followup1email', 'fu1email', 'fu1message', 'followupone'],
    variant: ['angle', 'variant', 'strategy', 'emailangle', 'approach', 'emailvariant', 'pitchangle'],
    sendFrom: ['sendfrom', 'sendfromemail', 'sendfromgmail', 'sender', 'senderemail', 'sendergmail',
               'assignedinbox', 'inbox', 'fromemail', 'sendingemail', 'sendinggmail', 'from', 'gmail',
               'mysendinggmail', 'sendinggmailaddress', 'yourgmail', 'mygmail'],
    fu2: ['followup2', 'followup2message', 'followupmessage2', 'fu2', 'email3', 'thirdemail', 'email3body', 'message3',
          'secondfollowup', 'followupemail2', 'followup2email', 'fu2email', 'fu2message', 'followuptwo']
  };
  var map = { email: -1, first: -1, last: -1, full: -1, company: -1,
              subject: -1, message: -1, fu1: -1, fu2: -1, sendFrom: -1, variant: -1, extras: [] };
  var norm = headers.map(normHeader_);
  Object.keys(names).forEach(function (k) {
    for (var i = 0; i < norm.length; i++) {
      if (names[k].indexOf(norm[i]) >= 0) { map[k] = i; break; }
    }
  });
  var used = [map.email, map.first, map.last, map.full, map.company,
              map.subject, map.message, map.fu1, map.fu2, map.sendFrom, map.variant];
  norm.forEach(function (n, i) { if (n && used.indexOf(i) < 0) map.extras.push(i); });
  return map;
}

function guessEmailColumn_(values) {
  var best = -1, bestCount = 0;
  var width = values[0].length;
  for (var c = 0; c < width; c++) {
    var count = 0;
    for (var r = 1; r < Math.min(values.length, 50); r++) if (isValidEmail_(normEmail_(values[r][c]))) count++;
    if (count > bestCount) { bestCount = count; best = c; }
  }
  return best;
}

function tidyName_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim().replace(/\s+/g, ' ');
  if (s && (s === s.toUpperCase() || s === s.toLowerCase())) {
    s = s.toLowerCase().replace(/(^|[\s\-'])([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); });
  }
  return s;
}

function render_(text, vars) {
  return String(text || '').replace(/\{\{\s*([^}|]+?)\s*(?:\|([^}]*))?\}\}/g, function (m, key, fallback) {
    var k = fieldKey_(key);
    var v = vars[k];
    if (v === undefined || v === null || String(v).trim() === '') return fallback !== undefined ? fallback.trim() : '';
    return String(v);
  });
}

function leadVars_(row, lc, senderName) {
  var vars = {};
  try { vars = JSON.parse(row[lc['Extra Fields']] || '{}') || {}; } catch (e) { vars = {}; }
  vars.first_name = row[lc['First Name']];
  vars.last_name = row[lc['Last Name']];
  vars.company = row[lc['Company']];
  vars.email = row[lc['Email']];
  vars.sender_name = senderName || '';
  vars.sender_first_name = String(senderName || '').split(' ')[0];
  return vars;
}

// The text to send for a step: the lead's own message, or the default follow-up.
// How many emails a lead has had (0-3). A cell formatted as a date comes back from Google as a
// date, so it is turned back into its number. Anything else unreadable falls back to counting
// the sent dates in the row.
function emailsSent_(row, lc) {
  var v = row[lc['Emails Sent']];
  var n;
  if (v instanceof Date) n = Math.round((v.getTime() - new Date(1899, 11, 30).getTime()) / 86400000);
  else if (v === '' || v === null || v === undefined) n = 0;
  else n = Number(v);
  if (isFinite(n) && n >= 0 && n <= 3 && Math.floor(n) === n) return n;
  return SENT_COLS.filter(function (h) {
    var d = lc[h] === undefined ? '' : row[lc[h]];
    return d !== '' && d !== null && d !== undefined;
  }).length;
}

function messageFor_(row, lc, step, st) {
  var own = String(row[lc[MESSAGE_COLS[step - 1]]] || '').trim();
  if (own) return own;
  if (step === 2) return st.defFu1;
  if (step === 3) return st.defFu2;
  return '';
}

function composeBody_(text, vars, st) {
  var body = render_(text, vars).trim();
  var sig = render_(st.signature || '', vars).trim();
  if (sig) body += '\n\n' + sig;
  if (st.optOut) body += '\n\n' + render_(st.optOut, vars).trim();
  return body;
}

// Tidies AI-written text: real line breaks, no stray quotes or spaces.
function cleanText_(v) {
  var s = String(v === null || v === undefined ? '' : v);
  if (s.indexOf('\n') < 0 && /\\n/.test(s)) s = s.replace(/(\\r)?\\n/g, '\n');
  s = s.replace(/\r\n?/g, '\n').trim();
  if (s.length > 1 && /^".*"$/s.test(s)) s = s.slice(1, -1).trim();
  return s;
}

// Emails that arrive as one block of text (no line breaks) get the greeting on its own
// line and short paragraphs of up to 2 sentences, with the last question on its own.
// Text that already has line breaks is left exactly as it is.
function spaceOut_(text) {
  var t = String(text || '').trim();
  if (!t || t.indexOf('\n') >= 0) return t;
  var greeting = '';
  var g = t.match(/^((?:hi|hello|hey|dear|good (?:morning|afternoon))\b[^,.!?\n]{0,40},)\s*/i);
  if (g) { greeting = g[1]; t = t.slice(g[0].length); }
  var abbrev = /(?:^|\s)(?:dr|mr|mrs|ms|st|inc|ltd|co|jr|sr|vs|etc|e\.g|i\.e|no)\.$/i;
  var sentences = [], start = 0;
  for (var i = 0; i < t.length; i++) {
    var ch = t.charAt(i);
    if ((ch === '.' || ch === '?' || ch === '!') && /\s/.test(t.charAt(i + 1) || '') &&
        /[A-Z0-9"'\u2018\u201C]/.test(t.slice(i + 1).trim().charAt(0)) && !abbrev.test(t.slice(start, i + 1))) {
      sentences.push(t.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  if (start < t.length) sentences.push(t.slice(start).trim());
  sentences = sentences.filter(String);
  if (sentences.length < 3 && !greeting) return String(text).trim();
  var last = sentences.length > 1 && /\?$/.test(sentences[sentences.length - 1]) ? sentences.pop() : '';
  var paras = [];
  for (var k = 0; k < sentences.length; k += 2) paras.push(sentences.slice(k, k + 2).join(' '));
  if (last) paras.push(last);
  return (greeting ? greeting + '\n\n' : '') + paras.join('\n\n');
}

function dailyLimitFor_(limit, st, dayIdx) {
  if (!st.rampStart) return limit;
  return Math.min(limit, st.rampStart + Math.max(0, dayIdx) * st.rampStep);
}

// Steady pace: share what is left today evenly over the runs left in the send window.
function runQuota_(remaining, nowMinute, endMinute, everyMinutes) {
  var runsLeft = Math.max(1, Math.ceil((endMinute - nowMinute) / everyMinutes));
  return Math.max(0, Math.ceil(remaining / runsLeft));
}

function addDays_(d, days) {
  return new Date(d.getTime() + days * 86400000);
}

function toBool_(v) {
  if (v === true || v === false) return v;
  return /^(true|yes|y|1|on)$/i.test(String(v).trim());
}

function isBounceSender_(fromEmail, fromRaw) {
  return /^(mailer-daemon|mailerdaemon|mail-daemon|postmaster)@/i.test(fromEmail) ||
    /mail delivery (subsystem|system)|delivery status notification/i.test(String(fromRaw || ''));
}

function isDelayNotice_(subject, body) {
  return /\(delay\)|delayed|delivery incomplete/i.test(String(subject || '')) ||
    /will (retry|keep trying)|has(n't| not) been delivered yet|temporary problem delivering/i.test(String(body || ''));
}

function bounceReason_(body) {
  var lines = String(body || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(String);
  var pat = /address not found|couldn't be delivered|could not be delivered|does(n't| not) exist|user unknown|no such user|mailbox (is )?(full|unavailable|disabled)|over quota|rejected|blocked|550|553|554|invalid recipient|not found/i;
  for (var i = 0; i < lines.length; i++) if (pat.test(lines[i])) return lines[i].slice(0, 200);
  return (lines[0] || 'Bounced').slice(0, 200);
}

function isAutoReply_(subject, autoSubmitted, xAuto, precedence) {
  if (autoSubmitted && !/^\s*no\s*$/i.test(autoSubmitted)) return true;
  if (xAuto) return true;
  if (precedence && /auto_reply|bulk|junk/i.test(precedence)) return true;
  return /auto(matic)?[\s-]?reply|autoreply|out of (the )?office|\booo\b|on vacation|away from (the )?office|abwesenheit|r[ée]ponse automatique|respuesta autom[áa]tica/i
    .test(String(subject || ''));
}

function replySnippet_(body) {
  var text = String(body || '');
  var cut = text.search(/^\s*On .{0,200}wrote:\s*$|^\s*>|^-{2,}\s*Original Message|^\s*From:\s|^_{5,}/im);
  if (cut > 0) text = text.slice(0, cut);
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function isUnsubscribe_(snippet) {
  var s = String(snippet || '').trim();
  if (/\b(unsubscribe|remove me|take me off|opt[\s-]?out|stop (emailing|contacting|sending)|do not (contact|email)|don'?t (contact|email)|no more emails)\b/i.test(s)) return true;
  return /^(no|nope|stop|remove)[\s.!,]*((thanks?|thank you)[\s.!]*)?$/i.test(s);
}

// Lets the pure helpers be unit-tested outside Google (ignored by Apps Script).
if (typeof module !== 'undefined') {
  module.exports = { normEmail_: normEmail_, isValidEmail_: isValidEmail_, isBlocked_: isBlocked_,
    extractEmail_: extractEmail_, mapHeaders_: mapHeaders_, guessEmailColumn_: guessEmailColumn_,
    tidyName_: tidyName_, render_: render_, messageFor_: messageFor_, composeBody_: composeBody_,
    cleanText_: cleanText_, dailyLimitFor_: dailyLimitFor_,
    runQuota_: runQuota_, isBounceSender_: isBounceSender_, isDelayNotice_: isDelayNotice_,
    bounceReason_: bounceReason_, isAutoReply_: isAutoReply_, replySnippet_: replySnippet_,
    isUnsubscribe_: isUnsubscribe_, fieldKey_: fieldKey_, colLetter_: colLetter_ };
}
