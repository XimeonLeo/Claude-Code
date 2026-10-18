/**
 * EMAIL OUTREACH TRACKER (Google Sheets + Apps Script)
 * ---------------------------------------------------
 * One master Google Sheet that:
 *   - builds its own tabs (Dashboard, Leads, Inboxes, Settings, Log, ...)
 *   - imports leads from a CSV or another Google Sheet (skips duplicates),
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
 *   4. Share the sheet with every sending Gmail, and in each one click
 *      Outreach -> Connect THIS Gmail.
 */

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
  'Message', 'Follow-up 1 Message', 'Follow-up 2 Message',
  'Thread ID', 'Message IDs', 'Extra Fields'];

// The columns that hold the text to send for step 1, 2, 3.
var MESSAGE_COLS = ['Message', 'Follow-up 1 Message', 'Follow-up 2 Message'];

var SENT_COLS = ['Email 1 Sent', 'Follow-up 1 Sent', 'Follow-up 2 Sent'];
var SENT_EVENTS = ['SENT_1', 'SENT_FU1', 'SENT_FU2'];

var INBOX_HEADERS = ['Inbox Email', 'Sender Name', 'Daily Limit', 'Status',
  'Connected', 'Last Run', 'Sent Today', 'Total Sent', 'Bounces', 'Bounce %',
  'Replies', 'Reply %', 'Leads Assigned', 'Leads Waiting', 'Health', 'Notes'];
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
    .addItem('Import leads from the Import tab', 'importFromTab')
    .addItem('Import leads from a link (Sheet or CSV)...', 'importFromLink')
    .addItem('Spread waiting leads across inboxes', 'rebalanceLeads')
    .addSeparator()
    .addItem('Connect THIS Gmail (start sending)', 'connectInbox')
    .addItem('Disconnect THIS Gmail (stop sending)', 'disconnectInbox')
    .addItem('Send a test email to myself', 'sendTestEmail')
    .addItem('Run now for THIS Gmail', 'runNow')
    .addItem('Check replies & bounces now', 'checkNow')
    .addSeparator()
    .addItem('Which Gmail am I using?', 'whoAmI')
    .addToUi();
}

// ---------------------------------------------------------------- setup

function setupSheet() {
  var ss = ss_();
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

  // Inboxes
  var ib = ensureSheet_(ss, SHEET.INBOXES, INBOX_HEADERS);
  writeInboxFormulas_(ib);
  ib.getRange(2, 4, INBOX_FORMULA_ROWS, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Active', 'Paused', 'Paused - bounces'], true)
      .setAllowInvalid(true).build());
  ib.getRange(2, 6, INBOX_FORMULA_ROWS, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  ib.getRange(2, 10, INBOX_FORMULA_ROWS, 1).setNumberFormat('0.0%');
  ib.getRange(2, 12, INBOX_FORMULA_ROWS, 1).setNumberFormat('0.0%');
  ib.setColumnWidth(1, 240); ib.setColumnWidth(2, 180);

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
  addStatusColors_(ld, lc);

  // Log, Import, Do Not Contact
  var lg = ensureSheet_(ss, SHEET.LOG, LOG_HEADERS);
  lg.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  var im = ensureSheet_(ss, SHEET.IMPORT, null);
  im.getRange('A1').setNote('Paste leads here with the header row in row 1 ' +
    '(e.g. Email, First Name, Company). Then click Outreach -> Import leads from the Import tab. ' +
    'This tab is cleared after each import.');
  ensureSheet_(ss, SHEET.DNC, DNC_HEADERS);

  // Dashboard (rebuilt every time, holds no data of its own)
  buildDashboard_(ss);

  // Tab order and colours
  var order = [SHEET.DASH, SHEET.LEADS, SHEET.INBOXES,
               SHEET.SETTINGS, SHEET.IMPORT, SHEET.LOG, SHEET.DNC];
  var colours = ['#1a73e8', '#188038', '#e37400', '#5f6368', '#12b5cb', '#5f6368', '#d93025'];
  order.forEach(function (name, idx) {
    var sh = ss.getSheetByName(name);
    ss.setActiveSheet(sh); ss.moveActiveSheet(idx + 1); sh.setTabColor(colours[idx]);
  });
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  ss.setActiveSheet(ss.getSheetByName(SHEET.DASH));

  toast_('Sheet is ready. Next: check Settings, connect your Gmails, then import leads.');
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

function writeInboxFormulas_(ib) {
  var rows = Math.max(INBOX_FORMULA_ROWS, lastFilledRow_(ib, 1) + 10);
  var f = [];
  for (var r = 2; r <= rows + 1; r++) {
    var a = '$A' + r;
    var sentAll = 'COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"SENT*")';
    var first = 'COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"SENT_1")';
    f.push([
      '=IF(' + a + '="","",COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"SENT*",Log!$A:$A,">="&TODAY()))',
      '=IF(' + a + '="","",' + sentAll + ')',
      '=IF(' + a + '="","",COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"BOUNCE"))',
      '=IF(' + a + '="","",IFERROR(I' + r + '/H' + r + ',0))',
      '=IF(' + a + '="","",COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"REPLY")+COUNTIFS(Log!$B:$B,' + a + ',Log!$D:$D,"UNSUB"))',
      '=IF(' + a + '="","",IFERROR(K' + r + '/' + first + ',0))',
      '=IF(' + a + '="","",COUNTIF(Leads!$G:$G,' + a + '))',
      '=IF(' + a + '="","",COUNTIFS(Leads!$G:$G,' + a + ',Leads!$F:$F,"New"))',
      '=IF(' + a + '="","",IF(D' + r + '<>"Active","⏸ "&D' + r + ',IF(H' + r + '<10,"⚪ Too early to tell",' +
        'IF(J' + r + '>=0.05,"🔴 High bounces",IF(J' + r + '>=0.02,"🟡 Watch","🟢 Healthy")))))'
    ]);
  }
  ib.getRange(2, 7, f.length, f[0].length).setFormulas(f);
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
    ['Interested', '=COUNTIF(Leads!$Q:$Q,"Interested")', '#,##0'],
    ['Meetings booked', '=COUNTIF(Leads!$Q:$Q,"Meeting booked")', '#,##0'],
    ['Active inboxes', '=COUNTIF(Inboxes!$D$2:$D,"Active")', '0'],
    ['Daily capacity at full speed', '=ARRAYFORMULA(SUM(IF(Inboxes!$D$2:$D="Active",IF(Inboxes!$C$2:$C="",' +
      V('Default daily limit per inbox') + ',Inboxes!$C$2:$C),0)))', '#,##0']
  ];
  d.getRange('A3:B3').setValues([['Campaign', '']]).setFontWeight('bold').setBackground('#e8f0fe');
  kpis.forEach(function (k, i) {
    var r = 4 + i;
    d.getRange(r, 1).setValue(k[0]);
    d.getRange(r, 2).setFormula(k[1]).setNumberFormat(k[2]).setFontWeight('bold');
  });

  d.getRange('D3:E3').setValues([['Leads by status', 'Count']]).setFontWeight('bold').setBackground('#e8f0fe');
  d.getRange('D4').setValue('Total leads');
  d.getRange('E4').setFormula('=COUNTA(Leads!$B$2:$B)').setFontWeight('bold');
  STATUS_LIST.forEach(function (s, i) {
    d.getRange(5 + i, 4).setValue(s);
    d.getRange(5 + i, 5).setFormula('=COUNTIF(Leads!$F:$F,"' + s + '")');
  });
  d.getRange(5 + STATUS_LIST.length, 4).setValue('No inbox assigned');
  d.getRange(5 + STATUS_LIST.length, 5).setFormula(
    '=COUNTIFS(Leads!$B$2:$B,"<>",Leads!$G$2:$G,"")');

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

// ---------------------------------------------------------------- import

function importFromTab() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET.IMPORT);
  if (!sh) return alert_('Run Outreach -> 1. Set up this sheet first.');
  var values = sh.getDataRange().getValues();
  if (values.length < 2) {
    return alert_('The Import tab is empty. Paste your leads there (header row in row 1, ' +
      'e.g. Email, First Name, Company), then run this again.');
  }
  var res = importRows_(ss, values, 'Import tab ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm'));
  if (res.imported > 0) sh.clearContents();
  alert_(importSummary_(res));
}

function importFromLink() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Import leads',
    'Paste a link to a Google Sheet, or to a CSV file in Google Drive.\n' +
    '(Excel files: open them with Google Sheets first, then use that link.)',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var url = r.getResponseText().trim();
  if (!url) return;
  var ss = ss_();
  var values, source;
  try {
    if (/\/spreadsheets\/d\//.test(url)) {
      var got = readSheetLink_(SpreadsheetApp.openByUrl(url), url);
      values = got.values; source = got.source;
    } else {
      var id = (url.match(/[-\w]{25,}/) || [])[0];
      if (!id) return alert_('That does not look like a Google Drive link.');
      var file = DriveApp.getFileById(id);
      if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
        var got2 = readSheetLink_(SpreadsheetApp.openById(id), url);
        values = got2.values; source = got2.source;
      } else {
        values = Utilities.parseCsv(file.getBlob().getDataAsString());
        source = file.getName();
      }
    }
  } catch (e) {
    return alert_('Could not open that file: ' + e.message +
      '\n\nMake sure the Gmail you are using now can open it.');
  }
  if (!values || values.length < 2) return alert_('No rows found in that file.');
  alert_(importSummary_(importRows_(ss, values, source)));
}

function readSheetLink_(book, url) {
  var gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];
  var tab = null;
  if (gid) tab = book.getSheets().filter(function (s) { return String(s.getSheetId()) === gid; })[0];
  tab = tab || book.getSheets()[0];
  return { values: tab.getDataRange().getValues(), source: book.getName() + ' / ' + tab.getName() };
}

function importRows_(ss, values, source) {
  var map = mapHeaders_(values[0]);
  if (map.email < 0) map.email = guessEmailColumn_(values);
  if (map.email < 0) throw new Error('Could not find an email column. Name one of your columns "Email".');

  var ld = ss.getSheetByName(SHEET.LEADS);
  var lc = colMap_(ld);
  var res = { imported: 0, duplicate: 0, invalid: 0, blocked: 0, unassigned: 0, noMessage: 0,
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
      if (inboxes.length) {
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
      line[lc['Message']] = cell(map.message);
      line[lc['Follow-up 1 Message']] = cell(map.fu1);
      line[lc['Follow-up 2 Message']] = cell(map.fu2);
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
  var moved = withLock_(function () {
    var n = ld.getLastRow() - 1;
    var status = ld.getRange(2, lc['Status'] + 1, n, 1).getValues();
    var assigned = ld.getRange(2, lc['Assigned Inbox'] + 1, n, 1).getValues();
    var k = 0, count = 0;
    for (var i = 0; i < n; i++) {
      if (status[i][0] === STATUS.NEW) {
        var target = inboxes[k++ % inboxes.length];
        if (normEmail_(assigned[i][0]) !== target) count++;
        assigned[i][0] = target;
      }
    }
    ld.getRange(2, lc['Assigned Inbox'] + 1, n, 1).setValues(assigned);
    return count;
  });
  alert_('Done. Waiting leads are now spread evenly across ' + inboxes.length +
    ' active inboxes (' + moved + ' leads moved).\n\nLeads already in a sequence stay with ' +
    'the inbox that emailed them, so follow-ups come from the same address.');
}

// ---------------------------------------------------------------- connect

function connectInbox() {
  var ui = SpreadsheetApp.getUi();
  var me = me_();
  if (!me) return alert_('Could not tell which Gmail you are using. Open this sheet in a browser window where only that Gmail is signed in.');
  requireGmailService_();
  var ss = ss_();
  PropertiesService.getScriptProperties().setProperty('SSID', ss.getId());

  var inbox = findInbox_(ss, me);
  var ib = ss.getSheetByName(SHEET.INBOXES);
  if (!inbox) {
    var r = ui.prompt('Add ' + me,
      'What sender name should people see? (e.g. "Sarah Jones")', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    var row = lastFilledRow_(ib, 1) + 1;
    ib.getRange(row, 1, 1, 4).setValues([[me, r.getResponseText().trim(), '', 'Active']]);
    inbox = findInbox_(ss, me);
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
    '\n\nAnything you click in this menu happens as this Gmail.');
}

// ---------------------------------------------------------------- the hourly run

function runForMe() { runForInbox_(); }

function runNow() { alert_(runForInbox_()); }

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

function ss_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { /* trigger context */ }
  if (!ss) ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SSID'));
  return ss;
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
  var byLabel = {};
  sh.getRange(1, 1, sh.getLastRow(), 2).getValues().forEach(function (r) { byLabel[String(r[0]).trim()] = r[1]; });
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

function findInbox_(ss, email) {
  var ib = ss.getSheetByName(SHEET.INBOXES);
  if (!ib) return null;
  var n = lastFilledRow_(ib, 1);
  if (n < 2) return null;
  var v = ib.getRange(2, 1, n - 1, 4).getValues();
  for (var i = 0; i < v.length; i++) {
    if (normEmail_(v[i][0]) === email) {
      return { row: i + 2, email: email, name: String(v[i][1] || '').trim(),
               limit: Number(v[i][2]) || 0, status: String(v[i][3] || 'Active').trim() };
    }
  }
  return null;
}

function activeInboxes_(ss) {
  var ib = ss.getSheetByName(SHEET.INBOXES);
  var n = lastFilledRow_(ib, 1);
  if (n < 2) return [];
  return ib.getRange(2, 1, n - 1, 4).getValues()
    .filter(function (r) { return normEmail_(r[0]) && String(r[3] || 'Active').trim() === 'Active'; })
    .map(function (r) { return normEmail_(r[0]); });
}

function setInboxCell_(ss, row, header, value) {
  var ib = ss.getSheetByName(SHEET.INBOXES);
  var col = INBOX_HEADERS.indexOf(header) + 1;
  withLock_(function () { ib.getRange(row, col).setValue(value); });
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

function alert_(msg) { SpreadsheetApp.getUi().alert(msg); }

function toast_(msg) { ss_().toast(msg, 'Outreach', 8); }

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
              'emailcopy', 'emailcontent', 'outreachmessage', 'coldemail', 'message1'],
    fu1: ['followup1', 'followup1message', 'followupmessage1', 'fu1', 'followup', 'followupmessage',
          'email2', 'secondemail', 'email2body', 'message2'],
    fu2: ['followup2', 'followup2message', 'followupmessage2', 'fu2', 'email3', 'thirdemail', 'email3body', 'message3']
  };
  var map = { email: -1, first: -1, last: -1, full: -1, company: -1,
              subject: -1, message: -1, fu1: -1, fu2: -1, extras: [] };
  var norm = headers.map(normHeader_);
  Object.keys(names).forEach(function (k) {
    for (var i = 0; i < norm.length; i++) {
      if (names[k].indexOf(norm[i]) >= 0) { map[k] = i; break; }
    }
  });
  var used = [map.email, map.first, map.last, map.full, map.company,
              map.subject, map.message, map.fu1, map.fu2];
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
