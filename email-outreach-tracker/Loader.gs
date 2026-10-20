/**
 * OUTREACH LOADER
 * ---------------
 * Paste this ONCE instead of Code.gs. It downloads the latest Outreach code from your admin
 * automatically (it checks every hour), so you never have to paste Code.gs again.
 *
 * In the master sheet: leave MASTER_SHEET and SENDER_NAME empty.
 * In each Gmail's own copy: fill in both (see SETUP.md, Part 2).
 * Also add the Gmail API service once: Services + -> Gmail API -> Add.
 */

var MASTER_SHEET = '';   // e.g. 'https://docs.google.com/spreadsheets/d/1AbC.../edit'
var SENDER_NAME = '';    // e.g. 'Sarah Jones'

// Where the latest Code.gs lives. The admin sets this ONCE before sharing this file.
var CODE_URL = 'https://drive.google.com/file/d/1W5Ap33DTLvVwo05_U4hX3YNDnrgAmXrq/view?usp=sharing';

// ------------------------------------------------------------- do not change below this line

var LOADER_VERSION = 4;
var CHECK_EVERY_MINUTES = 60;
var ENTRY_POINTS = ['onOpen', 'setupSheet', 'showUploadDialog', 'previewLeadText', 'importLeadText',
  'rebalanceLeads', 'connectInbox', 'disconnectInbox', 'whoAmI', 'runForMe', 'runNow', 'checkNow',
  'sendTestEmail', 'addTeamSheet', 'refreshTeam', 'refreshTeamAuto', 'teamAutoOn', 'teamAutoOff',
  'slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8', 'slot9', 'slot10'];

// Every menu item, trigger and upload-window button calls one of these.
function onOpen(e) { return run_('onOpen', arguments, true); }
function setupSheet() { return run_('setupSheet', arguments); }
function showUploadDialog() { return run_('showUploadDialog', arguments); }
function previewLeadText() { return run_('previewLeadText', arguments); }
function importLeadText() { return run_('importLeadText', arguments); }
function rebalanceLeads() { return run_('rebalanceLeads', arguments); }
function connectInbox() { return run_('connectInbox', arguments); }
function disconnectInbox() { return run_('disconnectInbox', arguments); }
function whoAmI() { return run_('whoAmI', arguments); }
function runForMe() { return run_('runForMe', arguments); }
function runNow() { return run_('runNow', arguments); }
function checkNow() { return run_('checkNow', arguments); }
function sendTestEmail() { return run_('sendTestEmail', arguments); }
function addTeamSheet() { return run_('addTeamSheet', arguments); }
function refreshTeam() { return run_('refreshTeam', arguments); }
function refreshTeamAuto() { return run_('refreshTeamAuto', arguments); }
function teamAutoOn() { return run_('teamAutoOn', arguments); }
function teamAutoOff() { return run_('teamAutoOff', arguments); }

// Spare buttons for future features, so new menu items never need a new loader.
function slot1() { return run_('slot1', arguments); }
function slot2() { return run_('slot2', arguments); }
function slot3() { return run_('slot3', arguments); }
function slot4() { return run_('slot4', arguments); }
function slot5() { return run_('slot5', arguments); }
function slot6() { return run_('slot6', arguments); }
function slot7() { return run_('slot7', arguments); }
function slot8() { return run_('slot8', arguments); }
function slot9() { return run_('slot9', arguments); }
function slot10() { return run_('slot10', arguments); }

// Outreach -> Check for updates now
function updateNow() {
  // Google's Allow screen lets people untick permissions; if any are missing, show it again.
  if (typeof ScriptApp.requireAllScopes === 'function') ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  var res = download_(true);
  var msg = res.ok ? 'You have the latest version: ' + res.version + '.'
                   : 'Could not update: ' + res.error + '\n\nThe sheet keeps working with the version it already has.';
  if (!res.ok && /permission/i.test(res.error)) {
    msg = 'Google is missing one of the permissions this script needs (it was unticked on the Allow screen).\n\n' +
      'Fix: Extensions -> Apps Script -> choose updateNow at the top -> Run -> on the Google screen tick "Select all" -> Allow.';
  }
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

var CORE_ = null;

function run_(name, args, quick) {
  if (!CORE_) {
    if (!quick) download_(false);
    CORE_ = build_();
  }
  if (!CORE_) {
    if (name === 'onOpen') {
      SpreadsheetApp.getUi().createMenu('📧 Outreach').addItem('Finish setup: download the code', 'updateNow').addToUi();
      return;
    }
    throw new Error('The Outreach code has not been downloaded yet. Check CODE_URL at the top of the script, ' +
      'then click Outreach -> Finish setup (or run updateNow).');
  }
  if (typeof CORE_[name] !== 'function') {
    throw new Error('This button needs a newer version of the code. Click Outreach -> Check for updates now, then try again.');
  }
  return CORE_[name].apply(null, args);
}

// Turns the stored code into working functions.
function build_() {
  var code = readStored_();
  if (!code) return null;
  // Only connect buttons the downloaded code really defines. Otherwise a name would point
  // back to the loader's own function and call itself forever.
  var exportList = ENTRY_POINTS.filter(function (n) {
    return new RegExp('(^|\\n)\\s*function\\s+' + n + '\\s*\\(').test(code);
  }).map(function (n) { return n + ': ' + n; }).join(', ');
  var factory = new Function('OUTREACH_CONFIG', code + '\n;return { ' + exportList + ' };');
  return factory({ MASTER_SHEET: MASTER_SHEET, SENDER_NAME: SENDER_NAME, loader: true, loaderVersion: LOADER_VERSION });
}

// Downloads the latest code (at most once an hour unless forced) and keeps it if it is valid.
function download_(force) {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('CORE_CHECKED') || 0);
  if (!force && Date.now() - last < CHECK_EVERY_MINUTES * 60000 && readStored_()) {
    return { ok: true, version: props.getProperty('CORE_VERSION') || '' };
  }
  props.setProperty('CORE_CHECKED', String(Date.now()));
  try {
    if (!CODE_URL) throw new Error('CODE_URL is empty at the top of the script.');
    var resp = UrlFetchApp.fetch(downloadUrl_(CODE_URL), { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) throw new Error('the code link answered ' + resp.getResponseCode() + '. Is it shared as "Anyone with the link"?');
    var code = resp.getContentText('UTF-8');
    var version = (code.match(/var CORE_VERSION = '([^']*)'/) || [])[1];
    if (!version) throw new Error('the link did not return the Outreach Code.gs file. Check it is shared as "Anyone with the link" and points to Code.gs.');
    new Function('OUTREACH_CONFIG', code); // stops a broken file from replacing a working one
    if (version !== props.getProperty('CORE_VERSION') || !readStored_()) store_(code, version);
    return { ok: true, version: version };
  } catch (e) {
    console.log('Update check failed: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// Accepts a normal Google Drive share link, a GitHub link, or any direct link.
function downloadUrl_(url) {
  var u = String(url).trim();
  var drive = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([-\w]{20,})/);
  if (drive) return 'https://drive.google.com/uc?export=download&id=' + drive[1];
  var gh = u.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  if (gh) return 'https://raw.githubusercontent.com/' + gh[1] + '/' + gh[2] + '/' + gh[3];
  return u;
}

// The code is kept in this script's own storage, split into small pieces.
function store_(code, version) {
  var props = PropertiesService.getScriptProperties();
  var size = 2000, parts = {}; // 2000 characters stay under Google's 9 KB limit, even with emojis
  var n = Math.ceil(code.length / size);
  for (var i = 0; i < n; i++) parts['CORE_PART_' + i] = code.substr(i * size, size);
  var old = Number(props.getProperty('CORE_PARTS') || 0);
  for (var j = n; j < old; j++) props.deleteProperty('CORE_PART_' + j);
  parts.CORE_PARTS = String(n);
  parts.CORE_VERSION = version;
  props.setProperties(parts);
}

function readStored_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var n = Number(props.CORE_PARTS || 0);
  if (!n) return '';
  var out = [];
  for (var i = 0; i < n; i++) {
    if (props['CORE_PART_' + i] === undefined) return '';
    out.push(props['CORE_PART_' + i]);
  }
  return out.join('');
}

// Never runs. It only tells Google which permissions the downloaded code needs,
// so everything is approved once when you first click Allow.
function permissionsList_() {
  SpreadsheetApp.openById(''); SpreadsheetApp.getActiveSpreadsheet(); SpreadsheetApp.getUi();
  GmailApp.search(''); GmailApp.createLabel(''); GmailApp.getUserLabelByName('');
  Gmail.Users.Messages.send({}, 'me'); Gmail.Users.Messages.get('me', '');
  ScriptApp.newTrigger('').timeBased(); ScriptApp.getProjectTriggers();
  Session.getEffectiveUser().getEmail(); HtmlService.createHtmlOutput('');
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(''), '');
  SpreadsheetApp.getUi().showModelessDialog(HtmlService.createHtmlOutput(''), '');
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(''));
  LockService.getScriptLock(); UrlFetchApp.fetch('');
}
