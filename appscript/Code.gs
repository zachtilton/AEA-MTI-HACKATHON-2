/**
 * AEA/MTI Hackathon 2 — Google Apps Script
 *
 * Handles POST requests from both submission forms, appends rows to the
 * appropriate sheet, and returns a JSON response.
 *
 * Sheet 1 (name: "Critique-Create"): Critique and Create path submissions
 * Sheet 2 (name: "Collab"):           Collab path submissions
 *
 * Deploy as: Execute as Me / Who has access: Anyone
 */

// ── Sheet names ───────────────────────────────────────────────────────────────
var SHEET_MAIN   = 'Critique-Create';
var SHEET_COLLAB = 'Collab';

// ── doGet — health-check endpoint ────────────────────────────────────────────
/**
 * doGet: respond to GET requests with a status message.
 * Useful for confirming the web app is deployed and reachable.
 * Visit the web app URL in a browser to verify.
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'AEA/MTI Hackathon 2 Apps Script is running.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── doPost — main form handler ────────────────────────────────────────────────
/**
 * doPost: receive FormData POST from the submission forms, validate, append row.
 *
 * Fields are read from e.parameter (multipart/form-data, no preflight):
 *   formType: 'critique-create' | 'collab'
 *
 * critique-create fields:
 *   name, email, path, option, claim, evidence, link, ethics, reflection
 *
 * collab fields:
 *   name, email, claim, templateLink, changelog, remixLink, ethics, reflection
 */
function doPost(e) {
  try {
    // Read FormData fields from e.parameter
    var data = e.parameter || {};

    var formType = (data.formType || '').toLowerCase().trim();

    if (formType === 'critique-create') {
      appendMainRow(data);
    } else if (formType === 'collab') {
      appendCollabRow(data);
    } else {
      return jsonResponse({ status: 'error', message: 'Unknown formType: ' + formType });
    }

    return jsonResponse({ status: 'success' });

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message || 'Internal error' });
  }
}

// ── Sheet writers ─────────────────────────────────────────────────────────────

/**
 * Append a row to the Critique-Create sheet.
 *
 * Columns: Timestamp | Name | Path | Option | Claim | Evidence | Link | Ethics | Reflection
 */
function appendMainRow(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_MAIN);

  if (!sheet) {
    throw new Error('Sheet "' + SHEET_MAIN + '" not found. Please create it and add header row.');
  }

  var timestamp  = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  var name       = sanitize(data.name);
  var path       = sanitize(data.path);
  var option     = sanitize(data.option);
  var claim      = sanitize(data.claim);
  var evidence   = sanitize(data.evidence);
  var link       = sanitize(data.link);
  var ethics     = sanitize(data.ethics);
  var reflection = sanitize(data.reflection);

  sheet.appendRow([timestamp, name, path, option, claim, evidence, link, ethics, reflection]);
}

/**
 * Append a row to the Collab sheet.
 *
 * Columns: Timestamp | Name | Claim | TemplateLink | Changelog | RemixLink | Ethics | Reflection
 */
function appendCollabRow(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_COLLAB);

  if (!sheet) {
    throw new Error('Sheet "' + SHEET_COLLAB + '" not found. Please create it and add header row.');
  }

  var timestamp    = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  var name         = sanitize(data.name);
  var claim        = sanitize(data.claim);
  var templateLink = sanitize(data.templateLink);
  var changelog    = sanitize(data.changelog);
  var remixLink    = sanitize(data.remixLink);
  var ethics       = sanitize(data.ethics);
  var reflection   = sanitize(data.reflection);

  sheet.appendRow([timestamp, name, claim, templateLink, changelog, remixLink, ethics, reflection]);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Sanitize a field: coerce to string, strip leading/trailing whitespace.
 * Does NOT strip HTML — the spreadsheet is not rendered as HTML.
 */
function sanitize(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Build a JSON ContentService response.
 */
function jsonResponse(obj, headers) {
  var output = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  // Note: Apps Script ContentService does not support setting arbitrary
  // response headers for doPost — CORS is handled by Google's infrastructure
  // for publicly deployed web apps. The headers object is kept here for
  // documentation purposes and future compatibility.
  return output;
}

// ── Sheet setup helper (run once manually from Apps Script editor) ─────────────

/**
 * setupSheets: Creates the two sheets with header rows if they don't exist.
 * Run this function ONCE from the Apps Script editor after pasting this code.
 * Do NOT deploy this as the web app entry point.
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Sheet 1: Critique-Create
  var main = ss.getSheetByName(SHEET_MAIN);
  if (!main) {
    main = ss.insertSheet(SHEET_MAIN);
  }
  if (main.getLastRow() === 0) {
    main.appendRow([
      'Timestamp', 'Name', 'Path', 'Option',
      'One-line Claim', 'Evidence of Work', 'Link',
      'Ethics Confirmed', 'Reflection'
    ]);
    main.getRange(1, 1, 1, 9).setFontWeight('bold');
    main.setFrozenRows(1);
  }

  // Sheet 2: Collab
  var collab = ss.getSheetByName(SHEET_COLLAB);
  if (!collab) {
    collab = ss.insertSheet(SHEET_COLLAB);
  }
  if (collab.getLastRow() === 0) {
    collab.appendRow([
      'Timestamp', 'Name', 'One-line Claim',
      'Based-on Template Link', 'Change-log',
      'Remix Link', 'Ethics Confirmed', 'Reflection'
    ]);
    collab.getRange(1, 1, 1, 8).setFontWeight('bold');
    collab.setFrozenRows(1);
  }

  Logger.log('Sheets set up successfully.');
}
