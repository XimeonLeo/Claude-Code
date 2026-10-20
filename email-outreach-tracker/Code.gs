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

// Change this every time you publish a new version, so you can see who has it
// (Outreach -> Which Gmail am I using?).
var CORE_VERSION = '2026-10-21';

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
  NEEDS: 'Needs message'
};
var STATUS_LIST = [STATUS.NEW, STATUS.NEEDS, STATUS.ACTIVE, STATUS.DONE, STATUS.REPLIED,
                   STATUS.BOUNCED, STATUS.UNSUB, STATUS.SKIPPED];

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
  'Replies', 'Reply %', 'Leads Assigned', 'Leads Waiting', 'Health', 'Notes', 'Last Result'];
var INBOX_FORMULA_ROWS = 60;

var LOG_HEADERS = ['Timestamp', 'Inbox', 'Lead Email', 'Event', 'Lead ID',
  'Detail', 'Thread ID', 'Gmail Message ID'];

var DNC_HEADERS = ['Email or @domain', 'Reason', 'Added At'];

var SETTINGS_DEF = [
  { key: 'name', label: 'Campaign name', value: 'Outreach Campaign', note: 'Shown on the Dashboard.' },
  { key: 'goal', label: 'Goal (delivered messages)', value: 5000, note: 'Delivered = sent minus bounced. Counts first emails and follow-ups.' },
  { key: 'start', label: 'Campaign start date', value: 'TODAY', note: 'Day 1 of the campaign.' },
  { key: 'length', label: 'Campaign length (days)', value: 11, note: '' },
  { key: 'dailyLimit', label: 'Default daily limit per inbox', value: 35, note: 'Max emails (first + follow-ups) per inbox per day. Override per inbox in the Inboxes tab.' },
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
  { key: 'bouncePause', label: 'Auto-pause inbox at bounce rate', value: 0.05, note: 'An inbox stops sending if bounces reach this rate (after 20 sends).' },
  { key: 'signature', label: 'Signature (added under every email)', value: '{{sender_name}}', note: 'Each Gmail signs with its own Sender Name. Leave blank if your messages already end with a name.' },
  { key: 'defSubject', label: 'Default subject (if a lead has none)', value: 'Quick question, {{first_name|there}}', note: 'Only used when the Subject column is empty.' },
  { key: 'defFu1', label: 'Default follow-up 1 (if a lead has none)', value: 'Hi {{first_name|there}}, just bumping this to the top of your inbox in case it got buried. Would it make sense to chat?', note: 'Only used when the lead has no Follow-up 1 Message. Leave blank to skip.' },
  { key: 'defFu2', label: 'Default follow-up 2 (if a lead has none)', value: 'Hi {{first_name|there}}, I will not keep filling your inbox, so this is my last note. If this is ever a priority, just reply and I will send details.', note: 'Only used when the lead has no Follow-up 2 Message. Leave blank to skip.' },
  { key: 'optOut', label: 'Opt-out line', value: 'P.S. Not relevant? Just reply "no" and I won\'t email you again.', note: 'Added to the end of every email. Leave blank for none.' },
  { key: 'paused', label: 'Pause everything', value: false, note: 'Set TRUE to stop all sending right away.' }
];

// ---------------------------------------------------------------- menu

function onOpen() {
  SpreadsheetApp.getUi().createMenu('📧 Outreach')
    .addItem('1. Set up / repair this sheet', 'setupSheet')
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
    .addItem('Which Gmail am I using?', 'whoAmI')
    .addItem(viaLoader_() ? 'Check for updates now' : 'Version: ' + CORE_VERSION, viaLoader_() ? 'updateNow' : 'whoAmI')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Admin: watch team sheets')
      .addItem('Add a team member\'s sheet', 'addTeamSheet')
      .addItem('Check all team sheets now', 'refreshTeam')
      .addItem('Turn on automatic checks (every 2 hours)', 'teamAutoOn')
      .addItem('Turn off automatic checks', 'teamAutoOff'))
    .addToUi();
}

// ---------------------------------------------------------------- setup

function setupSheet() {
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
    if (sv[i][0] === 'Campaign start date') st.getRange(i + 1, 2).setNumberFormat('yyyy-mm-dd');
    if (sv[i][0] === 'Auto-pause inbox at bounce rate') st.getRange(i + 1, 2).setNumberFormat('0%');
  }
  st.setColumnWidth(1, 260); st.setColumnWidth(2, 420); st.setColumnWidth(3, 480);
  st.getRange('B:B').setWrap(true);
  st.getRange('A:A').setFontWeight('bold');

  // Inboxes (formulas are written after the Leads tab exists)
  ensureSheet_(ss, SHEET.LEADS, LEAD_HEADERS);
  var ib = ensureSheet_(ss, SHEET.INBOXES, INBOX_HEADERS);
  writeInboxFormulas_(ib);
  var icm = colMap_(ib);
  ib.getRange(2, icm['Status'] + 1, INBOX_FORMULA_ROWS, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Active', 'Paused', 'Paused - bounces'], true)
      .setAllowInvalid(true).build());
  ib.getRange(2, icm['Last Run'] + 1, INBOX_FORMULA_ROWS, 1).setNumberFormat('yyyy-mm-dd hh:mm');
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
  buildDashboard_(ss);

  // Tab order and colours
  var order = [SHEET.DASH, SHEET.LEADS, SHEET.INBOXES,
               SHEET.SETTINGS, SHEET.LOG, SHEET.DNC];
  var colours = ['#1a73e8', '#188038', '#e37400', '#5f6368', '#5f6368', '#d93025'];
  order.forEach(function (name, idx) {
    var sh = ss.getSheetByName(name);
    ss.setActiveSheet(sh); ss.moveActiveSheet(idx + 1); sh.setTabColor(colours[idx]);
  });
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  ss.setActiveSheet(ss.getSheetByName(SHEET.DASH));

  toast_('Sheet is ready. Next: check Settings, connect your Gmails, then import leads.');
}

// Columns that newer versions of the script add. Anything else missing from a header row
// means someone renamed, deleted or moved a column, so repair must not guess.
var ADDED_LATER = {
  'Leads': ['Message', 'Follow-up 1 Message', 'Follow-up 2 Message', 'Variant'],
  'Inboxes': ['Last Result']
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
      return 'IF(' + st + '<>"Active","⏸ "&' + st + ',IF(' + tot + '<10,"⚪ Too early to tell",' +
        'IF(' + bp + '>=0.05,"🔴 High bounces",IF(' + bp + '>=0.02,"🟡 Watch","🟢 Healthy"))))';
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
  var colours = [[STATUS.REPLIED, '#d9ead3'], [STATUS.BOUNCED, '#f4cccc'],
                 [STATUS.UNSUB, '#e0e0e0'], [STATUS.SKIPPED, '#e0e0e0'], [STATUS.NEEDS, '#fce8b2'],
                 [STATUS.DONE, '#e8f0fe']];
  var rules = colours.map(function (c) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + col + '2="' + c[0] + '"')
      .setBackground(c[1]).setRanges([range]).build();
  });
  ld.setConditionalFormatRules(rules);
}

function buildDashboard_(ss) {
  var d = ss.getSheetByName(SHEET.DASH) || ss.insertSheet(SHEET.DASH);
  d.getCharts().forEach(function (c) { d.removeChart(c); });
  d.clear();
  var V = function (label) { return 'VLOOKUP("' + label + '",Settings!$A:$B,2,FALSE)'; };
  var Lt = sheetLetters_(ss.getSheetByName(SHEET.LEADS));
  var It = sheetLetters_(ss.getSheetByName(SHEET.INBOXES));
  var LC = function (h) { return 'Leads!$' + Lt[h] + ':$' + Lt[h]; };
  var LC2 = function (h) { return 'Leads!$' + Lt[h] + '$2:$' + Lt[h]; };
  var IC2 = function (h) { return 'Inboxes!$' + It[h] + '$2:$' + It[h]; };

  d.getRange('A1').setFormula('="📧 "&' + V('Campaign name'))
    .setFontSize(18).setFontWeight('bold');
  d.getRange('A2').setValue('Live numbers from the Log, Leads and Inboxes tabs. ' +
    'Do not type in this tab: "Set up / repair" rebuilds it.').setFontColor('#5f6368');

  var kpis = [
    ['Goal (delivered messages)', '=' + V('Goal (delivered messages)'), '#,##0'],
    ['Messages sent', '=COUNTIF(Log!$D:$D,"SENT*")', '#,##0'],
    ['Bounced', '=COUNTIF(Log!$D:$D,"BOUNCE")', '#,##0'],
    ['Delivered (sent minus bounced)', '=B5-B6', '#,##0'],
    ['Progress to goal', '=IFERROR(B7/B4,0)', '0.0%'],
    ['Still needed', '=MAX(0,B4-B7)', '#,##0'],
    ['Days left', '=MAX(0,INT(' + V('Campaign start date') + ')+' + V('Campaign length (days)') + '-TODAY())', '0'],
    ['Needed per day to hit goal', '=IF(B10=0,B9,ROUNDUP(B9/B10))', '#,##0'],
    ['Sent today', '=COUNTIFS(Log!$D:$D,"SENT*",Log!$A:$A,">="&TODAY())', '#,##0'],
    ['Bounce rate (keep under 2%)', '=IFERROR(B6/B5,0)', '0.0%'],
    ['Leads contacted', '=COUNTIF(Log!$D:$D,"SENT_1")', '#,##0'],
    ['Replies', '=COUNTIF(Log!$D:$D,"REPLY")+COUNTIF(Log!$D:$D,"UNSUB")', '#,##0'],
    ['Reply rate', '=IFERROR(B15/B14,0)', '0.0%'],
    ['Interested', '=COUNTIF(' + LC('Outcome') + ',"Interested")', '#,##0'],
    ['Meetings booked', '=COUNTIF(' + LC('Outcome') + ',"Meeting booked")', '#,##0'],
    ['Active inboxes', '=COUNTIF(' + IC2('Status') + ',"Active")', '0'],
    ['Daily capacity at full speed', '=ARRAYFORMULA(SUM(IF(' + IC2('Status') + '="Active",IF(' + IC2('Daily Limit') + '="",' +
      V('Default daily limit per inbox') + ',' + IC2('Daily Limit') + '),0)))', '#,##0']
  ];
  d.getRange('A3:B3').setValues([['Campaign', '']]).setFontWeight('bold').setBackground('#e8f0fe');
  kpis.forEach(function (k, i) {
    var r = 4 + i;
    d.getRange(r, 1).setValue(k[0]);
    d.getRange(r, 2).setFormula(k[1]).setNumberFormat(k[2]).setFontWeight('bold');
  });

  d.getRange('D3:E3').setValues([['Leads by status', 'Count']]).setFontWeight('bold').setBackground('#e8f0fe');
  d.getRange('D4').setValue('Total leads');
  d.getRange('E4').setFormula('=COUNTA(' + LC2('Email') + ')').setFontWeight('bold');
  STATUS_LIST.forEach(function (s, i) {
    d.getRange(5 + i, 4).setValue(s);
    d.getRange(5 + i, 5).setFormula('=COUNTIF(' + LC('Status') + ',"' + s + '")');
  });
  d.getRange(5 + STATUS_LIST.length, 4).setValue('No inbox assigned');
  d.getRange(5 + STATUS_LIST.length, 5).setFormula(
    '=COUNTIFS(' + LC2('Email') + ',"<>",' + LC2('Assigned Inbox') + ',"")');

  var top = 23;
  var heads = ['Day', 'Date', 'Messages sent', 'First emails', 'Follow-ups', 'Bounces', 'Replies'];
  d.getRange(top, 1, 1, heads.length).setValues([heads]).setFontWeight('bold').setBackground('#e8f0fe');
  d.getRange(top - 1, 1).setValue('Day by day').setFontWeight('bold').setFontSize(12);
  var rows = [];
  for (var n = 0; n < 30; n++) {
    var r = top + 1 + n;
    var cnt = function (ev) {
      return '=IF($B' + r + '="","",COUNTIFS(Log!$D:$D,"' + ev + '",Log!$A:$A,">="&$B' + r +
        ',Log!$A:$A,"<"&($B' + r + '+1)))';
    };
    rows.push([
      '=IF(' + n + '<' + V('Campaign length (days)') + ',' + (n + 1) + ',"")',
      '=IF($A' + r + '="","",INT(' + V('Campaign start date') + ')+' + n + ')',
      cnt('SENT*'), cnt('SENT_1'),
      '=IF($B' + r + '="","",C' + r + '-D' + r + ')',
      cnt('BOUNCE'),
      '=IF($B' + r + '="","",COUNTIFS(Log!$D:$D,"REPLY",Log!$A:$A,">="&$B' + r + ',Log!$A:$A,"<"&($B' + r +
        '+1))+COUNTIFS(Log!$D:$D,"UNSUB",Log!$A:$A,">="&$B' + r + ',Log!$A:$A,"<"&($B' + r + '+1)))'
    ]);
  }
  d.getRange(top + 1, 1, rows.length, heads.length).setFormulas(rows);
  d.getRange(top + 1, 2, rows.length, 1).setNumberFormat('ddd mmm d');

  // Results by angle (which email approach works best)
  var VAR = 'INDEX(Leads!$A:$BZ,0,MATCH("Variant",Leads!$1:$1,0))';
  var at = 22, ac = 9; // starts at I22
  d.getRange(at - 1, ac).setValue('Results by angle').setFontWeight('bold').setFontSize(12);
  var aHeads = ['Angle', 'Leads emailed', 'Replies', 'Reply rate', 'Interested + meetings', 'Positive rate'];
  d.getRange(at, ac, 1, aHeads.length).setValues([aHeads]).setFontWeight('bold').setBackground('#e8f0fe');
  d.getRange(at + 1, ac).setFormula('=IFERROR(SORT(UNIQUE(FILTER(' + VAR + ',' + VAR + '<>"",' + VAR + '<>"Variant"))),"")');
  var aRows = [];
  for (var ar = at + 1; ar <= at + 10; ar++) {
    var A = '$I' + ar;
    aRows.push([
      '=IF(' + A + '="","",COUNTIFS(' + VAR + ',' + A + ',' + LC('Emails Sent') + ',">0"))',
      '=IF(' + A + '="","",COUNTIFS(' + VAR + ',' + A + ',' + LC('Status') + ',"Replied")+COUNTIFS(' + VAR + ',' + A + ',' + LC('Status') + ',"Unsubscribed"))',
      '=IF(' + A + '="","",IFERROR(K' + ar + '/J' + ar + ',0))',
      '=IF(' + A + '="","",COUNTIFS(' + VAR + ',' + A + ',' + LC('Outcome') + ',"Interested")+COUNTIFS(' + VAR + ',' + A + ',' + LC('Outcome') + ',"Meeting booked"))',
      '=IF(' + A + '="","",IFERROR(M' + ar + '/J' + ar + ',0))'
    ]);
  }
  d.getRange(at + 1, ac + 1, aRows.length, 5).setFormulas(aRows);
  d.getRange(at + 1, ac + 3, aRows.length, 1).setNumberFormat('0.0%');
  d.getRange(at + 1, ac + 5, aRows.length, 1).setNumberFormat('0.0%');
  d.getRange(at + 11, ac).setValue('Judge an angle only after about 100 leads emailed with it.')
    .setFontColor('#5f6368').setFontStyle('italic');
  d.setColumnWidth(ac, 180);

  d.setColumnWidth(1, 260); d.setColumnWidth(2, 120); d.setColumnWidth(3, 120);
  d.setColumnWidth(4, 180);

  var chart = d.newChart().asColumnChart()
    .addRange(d.getRange(top, 2, 1 + 30, 2))
    .addRange(d.getRange(top, 7, 1 + 30, 1))
    .setNumHeaders(1)
    .setOption('title', 'Messages sent and replies per day')
    .setOption('legend', { position: 'bottom' })
    .setPosition(3, 7, 0, 0)
    .build();
  d.insertChart(chart);
}

// ---------------------------------------------------------------- import: upload a lead file

// Opens a small window: pick a CSV file (or paste the text), choose a Gmail, check, import.
function showUploadDialog() {
  var ss = ss_();
  if (!ss.getSheetByName(SHEET.LEADS)) return alert_('Run Outreach -> 1. Set up this sheet first.');
  var options = allInboxes_(ss).map(function (i) {
    return '<option value="' + i + '">' + i + '</option>';
  }).join('');
  var html = HtmlService.createHtmlOutput(UPLOAD_HTML_.replace('{{OPTIONS}}', options))
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

// Called by the upload window: checks the file without importing anything.
function previewLeadText(text) {
  var rows = leadRowsFromText_(text);
  if (rows.length < 2) {
    return { leads: 0, error: 'No leads found. The first line must be the column names, for example: Email,First Name,Company,...' };
  }
  return checkLeadRows_(rows);
}

// Called by the upload window: imports the leads and returns the summary text.
function importLeadText(text, inbox, name) {
  var ss = ss_();
  var rows = leadRowsFromText_(text);
  if (rows.length < 2) throw new Error('No leads found. The first line must be the column names.');
  inbox = normEmail_(inbox);
  if (inbox && allInboxes_(ss).indexOf(inbox) < 0) throw new Error(inbox + ' is not on the Inboxes tab.');
  var source = (name || 'Upload') + ' ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
  return importSummary_(importRows_(ss, rows, source, inbox)) + gapsText_(checkLeadRows_(rows));
}

var UPLOAD_HTML_ = [
  '<style>',
  'body{font-family:Arial,sans-serif;font-size:14px;color:#222;margin:0;padding:2px 6px}',
  'h3{margin:14px 0 6px;font-size:15px}',
  'textarea{width:100%;box-sizing:border-box;height:100px;font-family:monospace;font-size:12px}',
  'select{font-size:14px;padding:6px;max-width:100%}',
  '.btn{background:#1a73e8;color:#fff;border:0;border-radius:4px;padding:9px 18px;font-size:14px;cursor:pointer}',
  '.btn:disabled{background:#9bb8e8}',
  '.ok{color:#188038;white-space:nowrap}.bad{color:#c5221f;font-weight:bold;white-space:normal}',
  '.box{border:1px solid #ddd;border-radius:6px;padding:10px;margin-top:10px;background:#fafafa;white-space:pre-wrap}',
  '.hint{color:#666;margin:6px 0}',
  '</style>',
  '<h3>1. Choose your lead file</h3>',
  '<input type="file" id="file" accept=".csv,.tsv,.txt,text/csv">',
  '<div class="hint">or paste the CSV text, or rows copied from a sheet (with the header row), here:</div>',
  '<textarea id="paste" placeholder="Email,First Name,Last Name,Company,Subject,Message,Follow-up 1,Follow-up 2,..."></textarea>',
  '<h3>2. Which Gmail sends them?</h3>',
  '<select id="inbox"><option value="">Spread evenly across all Gmails</option>{{OPTIONS}}</select>',
  '<div class="hint">A Send From column in the file wins over this choice.</div>',
  '<p><button class="btn" id="check" onclick="check()">Check file</button></p>',
  '<div id="out"></div>',
  '<script>',
  'var fileText = "", fileName = "";',
  'document.getElementById("file").addEventListener("change", function (e) {',
  '  var f = e.target.files[0]; if (!f) return;',
  '  if (/\\.xlsx?$/i.test(f.name)) { show("<p class=bad>That is an Excel file. Open it in Google Sheets or Excel, choose File, Download, CSV, then pick the CSV here.</p>"); return; }',
  '  var r = new FileReader();',
  '  r.onload = function () { fileText = r.result; fileName = f.name; document.getElementById("paste").value = ""; show("<p>Loaded " + esc(f.name) + ". Click Check file.</p>"); };',
  '  r.readAsText(f);',
  '});',
  'function current() { var p = document.getElementById("paste").value; return p.trim() ? { text: p, name: "Pasted leads" } : { text: fileText, name: fileName || "Uploaded file" }; }',
  'function check() {',
  '  var c = current(); if (!c.text.trim()) { show("<p class=bad>Choose a file or paste your leads first.</p>"); return; }',
  '  busy(true, "Checking..."); google.script.run.withSuccessHandler(function (p) { busy(false); preview(p); }).withFailureHandler(fail).previewLeadText(c.text);',
  '}',
  'function preview(p) {',
  '  if (!p.leads) { show("<p class=bad>" + esc(p.error || "No leads with an email were found.") + "</p>"); return; }',
  '  var h = "<div class=box><b>" + p.leads + " leads found.</b>\\n";',
  '  p.columns.forEach(function (c) { h += (c.ok ? "<span class=ok>&#10004; " : "<span class=bad>&#10008; ") + esc(c.label) + "</span>   "; });',
  '  if (p.gaps.length) h += "\\n\\nEmpty cells: " + p.gaps.map(function (g) { return esc(g.label) + " (" + g.count + ")"; }).join(", ");',
  '  if (p.noEmail) h += "\\n" + p.noEmail + " rows have no email and will be skipped.";',
  '  if (p.sample) h += "\\n\\nFirst lead: " + esc(p.sample);',
  '  h += "</div>";',
  '  if (p.missing.length) h += "<p class=bad>Missing columns: " + esc(p.missing.join(", ")) + ". Best fix: make the file again with the lead prompt (LEAD-PROMPT.txt).</p><p><button class=btn onclick=go()>Import anyway</button></p>";',
  '  else h += "<p><button class=btn onclick=go()>Import " + p.leads + " leads</button></p>";',
  '  show(h);',
  '}',
  'function go() {',
  '  var c = current(); busy(true, "Importing... this can take a minute.");',
  '  google.script.run.withSuccessHandler(function (msg) { busy(false); show("<div class=box>" + esc(msg) + "</div><p><button class=btn onclick=google.script.host.close()>Close</button></p>"); })',
  '    .withFailureHandler(fail).importLeadText(c.text, document.getElementById("inbox").value, c.name);',
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

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runForMe') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runForMe').timeBased().everyHours(1).create();

  setInboxCell_(ss, inbox.row, 'Connected', 'Yes, ' +
    Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm'));
  if (inbox.status !== 'Active') setInboxCell_(ss, inbox.row, 'Status', 'Active');
  log_(ss, me, '', 'CONNECTED', '', 'Hourly sending turned on', '', '');

  var st = readSettings_(ss);
  alert_('Connected: ' + me + '\n\nIt will now run every hour between ' + st.startHour + ':00 and ' +
    st.endHour + ':00, sending only the leads assigned to it, and checking for replies and bounces.' +
    '\n\nTip: click "Spread waiting leads across inboxes" after connecting new Gmails.');
}

function disconnectInbox() {
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
  log_(ss, me, '', 'DISCONNECTED', '', 'Hourly sending turned off', '', '');
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

// ---------------------------------------------------------------- the hourly run

function runForMe() { runAndRecord_(); }

function runNow() { alert_(runAndRecord_()); }

// Runs one round and writes what happened into the Inboxes tab (Last Result),
// so you can always see why a Gmail did or did not send.
function runAndRecord_() {
  var result;
  try {
    result = runForInbox_();
  } catch (e) {
    result = 'ERROR: ' + e.message;
    try { log_(ss_(), me_(), '', 'ERROR', '', 'Run failed: ' + e.message, '', ''); } catch (e2) { /* ignore */ }
  }
  try {
    var ss = ss_();
    var inbox = findInbox_(ss, me_());
    if (inbox) {
      setInboxCell_(ss, inbox.row, 'Last Result',
        Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MMM d HH:mm') + ' - ' + result);
    }
  } catch (e3) { /* ignore */ }
  return result;
}

function checkNow() {
  var ss = ss_();
  requireGmailService_();
  var st = readSettings_(ss);
  alert_(checkInbox_(ss, me_(), st));
}

function runForInbox_() {
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
    setInboxCell_(ss, inbox.row, 'Last Run', new Date());

    var checked = checkInbox_(ss, me, st);
    if (st.paused) return 'Paused (Settings -> Pause everything). ' + checked;
    if (inbox.status !== 'Active') return 'Inbox status is "' + inbox.status + '". ' + checked;

    var now = new Date();
    var hour = Number(Utilities.formatDate(now, tz, 'H'));
    var dow = Number(Utilities.formatDate(now, tz, 'u')); // 1 = Mon ... 7 = Sun
    if (!st.weekends && dow >= 6) return 'Weekend, not sending. ' + checked;
    if (hour < st.startHour || hour >= st.endHour) {
      return 'Outside the send window (' + st.startHour + ':00-' + st.endHour + ':00). ' + checked;
    }

    var stats = inboxStats_(ss, me);
    if (stats.totalSent >= 20 && stats.bounces / stats.totalSent >= st.bouncePause) {
      setInboxCell_(ss, inbox.row, 'Status', 'Paused - bounces');
      log_(ss, me, '', 'INBOX_PAUSED', '', 'Bounce rate ' +
        Math.round(100 * stats.bounces / stats.totalSent) + '%', '', '');
      return 'Paused this inbox: too many bounces. ' + checked;
    }

    var limit = dailyLimitFor_(inbox.limit || st.dailyLimit, st, dayIndex_(st.start, now, tz));
    var remaining = limit - stats.sentToday;
    if (remaining <= 0) return 'Daily limit reached (' + limit + '). ' + checked;
    var quota = runQuota_(remaining, hour, st.endHour);

    var ld = ss.getSheetByName(SHEET.LEADS);
    var lc = colMap_(ld);
    var data = ld.getDataRange().getValues();
    var dnc = loadDnc_(ss);
    var maxSteps = 1 + st.followUps;
    var due = [], fresh = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (normEmail_(row[lc['Assigned Inbox']]) !== me || !row[lc['Email']]) continue;
      var status = row[lc['Status']];
      var sent = Number(row[lc['Emails Sent']]) || 0;
      var next = row[lc['Next Send']];
      if (status === STATUS.ACTIVE && sent < maxSteps && next instanceof Date && next <= now) due.push(i);
      else if (status === STATUS.NEW || (status === '' && sent === 0)) fresh.push(i);
    }
    due.sort(function (a, b) { return data[a][lc['Next Send']] - data[b][lc['Next Send']]; });
    var queue = due.concat(fresh).slice(0, quota);
    if (!queue.length) return 'Nothing due right now. ' + checked;

    var started = Date.now();
    var sentCount = 0, errors = 0;
    for (var q = 0; q < queue.length; q++) {
      if (Date.now() - started > 240000) break; // stay well inside Google's 6 minute limit
      var idx = queue[q];
      var lead = data[idx];
      var leadId = lead[lc['Lead ID']];
      var email = normEmail_(lead[lc['Email']]);

      if (isBlocked_(email, dnc)) {
        updateLead_(ld, lc, leadId, idx + 1, { 'Status': STATUS.SKIPPED, 'Next Send': '' });
        log_(ss, me, email, 'SKIPPED', leadId, 'On Do Not Contact list', '', '');
        continue;
      }

      var step = (Number(lead[lc['Emails Sent']]) || 0) + 1;
      var vars = leadVars_(lead, lc, inbox.name);
      var text = messageFor_(lead, lc, step, st);
      if (!text) {
        if (step === 1) {
          updateLead_(ld, lc, leadId, idx + 1, { 'Status': STATUS.NEEDS });
          log_(ss, me, email, 'SKIPPED', leadId, 'No message to send', '', '');
        } else {
          // no follow-up text for this step: the sequence ends here
          updateLead_(ld, lc, leadId, idx + 1, { 'Status': STATUS.DONE, 'Next Send': '' });
        }
        continue;
      }
      var body = composeBody_(text, vars, st);
      var subject = step === 1
        ? render_(String(lead[lc['Subject']] || '').trim() || st.defSubject, vars)
        : 'Re: ' + String(lead[lc['Subject']] || '').replace(/^re:\s*/i, '');
      var prevIds = String(lead[lc['Message IDs']] || '').trim();

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
        if (step === 1) up['Subject'] = subject;
        if (step < maxSteps) {
          up['Status'] = STATUS.ACTIVE;
          up['Next Send'] = addDays_(at, step === 1 ? st.fu1Days : st.fu2Days);
        } else {
          up['Status'] = STATUS.DONE;
          up['Next Send'] = '';
        }
        updateLead_(ld, lc, leadId, idx + 1, up);
        log_(ss, me, email, SENT_EVENTS[step - 1], leadId, subject, res.threadId, res.id);
        sentCount++;
      } catch (e) {
        errors++;
        log_(ss, me, email, 'ERROR', leadId, 'Send failed: ' + e.message, '', '');
        updateLead_(ld, lc, leadId, idx + 1, { 'Notes': 'Send error: ' + e.message });
        if (/limit|quota|too many|rate/i.test(e.message) || errors >= 3) break;
      }

      if (q < queue.length - 1) {
        var wait = st.minDelay + Math.random() * Math.max(0, st.maxDelay - st.minDelay);
        if (Date.now() - started + wait * 1000 > 240000) break;
        Utilities.sleep(Math.round(wait * 1000));
      }
    }
    return 'Sent ' + sentCount + ' email(s)' + (errors ? ', ' + errors + ' error(s) (see Log)' : '') +
      '. Today: ' + (stats.sentToday + sentCount) + '/' + limit + '. ' + checked;
  } finally {
    userLock.releaseLock();
  }
}

// ---------------------------------------------------------------- replies & bounces

function checkInbox_(ss, me, st) {
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

  var seen = processedIds_(ss, me);
  var threads = GmailApp.search('in:anywhere newer_than:4d -from:me', 0, 300);
  if (!threads.length) return 'No new replies or bounces.';
  var all = GmailApp.getMessagesForThreads(threads);
  var label = null;
  var replies = 0, bounces = 0, autos = 0;

  for (var t = 0; t < threads.length; t++) {
    var tid = threads[t].getId();
    var msgs = all[t];
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
    ' bounce(s), ' + autos + ' auto-repl' + (autos === 1 ? 'y' : 'ies') + '.';
}

// ---------------------------------------------------------------- test email

function sendTestEmail() {
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

function refreshTeam() { if (notAdmin_()) return; alert_(refreshTeam_()); }
function refreshTeamAuto() { if (isAdmin_()) refreshTeam_(); }

function teamAutoOn() {
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
  return 'Checked ' + (counts.ok + counts.check + counts.problem) + ' team sheets: ' +
    counts.ok + ' OK, ' + counts.check + ' to check, ' + counts.problem + ' with problems.\n\n' +
    (alertRows.length ? alertRows.length + ' new alerts were added to the Team Alerts tab.' : 'No new alerts.');
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
            resetToNew: 0, handReplied: 0, dupes: 0 };
  var seen = {};
  for (var r = 1; r < leads.length; r++) {
    var row = leads[r];
    var email = normEmail_(row[lh['Email']]);
    if (!email) continue;
    s.leads++;
    if (seen[email]) s.dupes++;
    seen[email] = true;
    var status = String(row[lh['Status']] || '').trim();
    var sent = Number(row[lh['Emails Sent']]) || 0;
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
  }

  // Log
  var log = d.log || [[]];
  var gh = idx(log[0]);
  var logRows = 0, logSends = 0, sentToday = 0, sent7 = 0, lastSent = null;
  for (var i = 1; i < log.length; i++) {
    var ev = String(log[i][gh['Event']] || '');
    var ts = log[i][gh['Timestamp']];
    if (!ev && !ts) continue;
    logRows++;
    if (SENT_EVENTS.indexOf(ev) < 0) continue;
    logSends++;
    if (ts instanceof Date) {
      if (ts >= todayStart) sentToday++;
      if (now - ts < 7 * day) sent7++;
      if (!lastSent || ts > lastSent) lastSent = ts;
    }
  }

  // Inboxes
  var ibv = d.inboxes || [[]];
  var ih = idx(ibv[0]);
  var inboxes = 0, active = 0, redHealth = 0;
  for (var j = 1; j < ibv.length; j++) {
    if (!isValidEmail_(normEmail_(ibv[j][ih['Inbox Email']]))) continue;
    inboxes++;
    if (String(ibv[j][ih['Status']]).trim() === 'Active') active++;
    if (String(ibv[j][ih['Health']] || '').indexOf('🔴') >= 0) redHealth++;
  }

  // Do Not Contact
  var dnc = (d.dnc || [[]]).slice(1).filter(function (x) { return String(x[0]).trim() !== ''; }).length;

  // Settings
  var st = settingsFromValues_(d.settings || []);
  if (d.settings) {
    var labels = {};
    d.settings.forEach(function (x) { labels[String(x[0]).trim()] = true; });
    var gone = SETTINGS_DEF.filter(function (x) { return !labels[x.label]; }).map(function (x) { return x.label; });
    if (gone.length) add('red', 'settingsRows', 'Settings rows deleted or renamed: ' + gone.join(', '), HOW_REPAIR);
    if (st.dailyLimit > 35) add('yellow', 'limit', 'Daily limit raised to ' + st.dailyLimit + ' (max 35 for free Gmail)', 'Their Settings tab.');
    if (!st.rampStart) add('yellow', 'warmup', 'Warm-up turned off', 'Their Settings tab.');
    if (st.paused) add('yellow', 'paused', 'Sending is paused (Pause everything = TRUE)', 'Their Settings tab.');
    if (!st.optOut) add('yellow', 'optout', 'Opt-out line removed', 'Their Settings tab.');
    if (st.followUps === 0) add('yellow', 'nofu', 'Follow-ups turned off', 'Their Settings tab.');
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
  if (redHealth) add('yellow', 'health', redHealth + ' Gmail(s) paused for too many bounces', 'Their Inboxes tab: Health column.');
  var weekend = [0, 6].indexOf(now.getDay()) >= 0;
  if (!st.paused && active > 0 && s.waiting > 0 && !(weekend && !st.weekends) &&
      (!lastSent || now - lastSent > 26 * 3600000)) {
    add('yellow', 'idle', 'Nothing sent in the last 24 hours, but ' + s.waiting + ' leads are waiting', 'Their Inboxes tab: read Last Result.');
  }
  if (d.leads && s.waiting === 0 && s.leads > 0 && !st.paused) add('yellow', 'empty', 'No leads waiting: they need to upload more', '');

  return {
    flags: flags,
    stats: { sentToday: sentToday, sent7: sent7, totalSent: s.totalSent, bouncePct: bouncePct,
             replies: s.replies, replyPct: s.emailed ? s.replies / s.emailed : 0, meetings: s.meetings,
             waiting: s.waiting, activeInboxes: active, inboxes: inboxes, lastSent: lastSent },
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

function updateLead_(ld, lc, leadId, rowHint, updates) {
  withLock_(function () {
    var row = rowHint;
    if (String(ld.getRange(row, lc['Lead ID'] + 1).getValue()) !== String(leadId)) {
      // rows were sorted or moved since we read them: find the lead again
      row = -1;
      var ids = ld.getRange(2, lc['Lead ID'] + 1, Math.max(1, ld.getLastRow() - 1), 1).getValues();
      for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(leadId)) { row = i + 2; break; }
      if (row < 0) return;
    }
    Object.keys(updates).forEach(function (h) {
      if (lc[h] === undefined) return;
      ld.getRange(row, lc[h] + 1).setValue(updates[h]);
    });
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
  s.weekends = toBool_(s.weekends);
  s.paused = toBool_(s.paused);
  s.optOut = String(s.optOut || '').trim();
  s.signature = String(s.signature || '').trim();
  s.defSubject = String(s.defSubject || '').trim();
  s.defFu1 = String(s.defFu1 || '').trim();
  s.defFu2 = String(s.defFu2 || '').trim();
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
               limit: Number(r[ic['Daily Limit']]) || 0, status: String(r[ic['Status']] || 'Active').trim() });
  });
  return out;
}

function findInbox_(ss, email) {
  return inboxRows_(ss).filter(function (x) { return x.email === email; })[0] || null;
}

function allInboxes_(ss) {
  return inboxRows_(ss).map(function (x) { return x.email; });
}

function activeInboxes_(ss) {
  return inboxRows_(ss).filter(function (x) { return x.status === 'Active'; })
    .map(function (x) { return x.email; });
}

function setInboxCell_(ss, row, header, value) {
  var ib = ss.getSheetByName(SHEET.INBOXES);
  var col = colMap_(ib)[header];
  if (col === undefined) return;
  withLock_(function () { ib.getRange(row, col + 1).setValue(value); });
}

function inboxStats_(ss, me) {
  var lg = ss.getSheetByName(SHEET.LOG);
  var out = { sentToday: 0, totalSent: 0, bounces: 0 };
  if (lg.getLastRow() < 2) return out;
  var v = lg.getRange(2, 1, lg.getLastRow() - 1, 4).getValues();
  var midnight = startOfToday_(ss);
  v.forEach(function (r) {
    if (normEmail_(r[1]) !== me) return;
    var ev = String(r[3]);
    if (ev.indexOf('SENT') === 0) {
      out.totalSent++;
      if (r[0] instanceof Date && r[0] >= midnight) out.sentToday++;
    } else if (ev === 'BOUNCE') out.bounces++;
  });
  return out;
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

function runQuota_(remaining, hour, endHour) {
  var runsLeft = Math.max(1, endHour - hour);
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
