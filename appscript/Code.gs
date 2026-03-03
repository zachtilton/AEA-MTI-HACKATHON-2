/**
 * AEA/MTI Hackathon 2 — Google Apps Script
 *
 * Handles POST requests from all three submission forms, appends rows to the
 * appropriate sheet, and returns a JSON response.
 *
 * Sheet 1 (name: "Critique"): Critique path submissions
 * Sheet 2 (name: "Create"):   Create path submissions
 * Sheet 3 (name: "Collab"):   Collab path submissions
 *
 * Deploy as: Execute as Me / Who has access: Anyone
 */

// ── Sheet names ───────────────────────────────────────────────────────────────
var SHEET_CRITIQUE = 'Critique';
var SHEET_CREATE   = 'Create';
var SHEET_COLLAB   = 'Collab';

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
 *   formType: 'critique' | 'create' | 'collab'
 *
 * critique / create fields:
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

    if (formType === 'critique') {
      appendCritiqueRow(data);
    } else if (formType === 'create') {
      appendCreateRow(data);
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
 * Append a row to the Critique sheet.
 *
 * Columns: Timestamp | Name | Path | Option | Claim | Evidence | Link | Ethics | Reflection
 */
function appendCritiqueRow(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CRITIQUE);

  if (!sheet) {
    throw new Error('Sheet "' + SHEET_CRITIQUE + '" not found. Please run setupSheets() first.');
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
 * Append a row to the Create sheet.
 *
 * Columns: Timestamp | Name | Path | Option | Claim | Evidence | Link | Ethics | Reflection
 */
function appendCreateRow(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CREATE);

  if (!sheet) {
    throw new Error('Sheet "' + SHEET_CREATE + '" not found. Please run setupSheets() first.');
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
    throw new Error('Sheet "' + SHEET_COLLAB + '" not found. Please run setupSheets() first.');
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
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Sheet setup helper (run once manually from Apps Script editor) ─────────────

/**
 * setupSheets: Creates the three sheets with header rows if they don't exist.
 * Run this function ONCE from the Apps Script editor after pasting this code.
 * Do NOT deploy this as the web app entry point.
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Sheet 1: Critique
  var critique = ss.getSheetByName(SHEET_CRITIQUE);
  if (!critique) {
    critique = ss.insertSheet(SHEET_CRITIQUE);
  }
  if (critique.getLastRow() === 0) {
    critique.appendRow([
      'Timestamp', 'Name', 'Path', 'Option',
      'One-line Claim', 'Evidence of Work', 'Link',
      'Ethics Confirmed', 'Reflection'
    ]);
    critique.getRange(1, 1, 1, 9).setFontWeight('bold');
    critique.setFrozenRows(1);
  }

  // Sheet 2: Create
  var create = ss.getSheetByName(SHEET_CREATE);
  if (!create) {
    create = ss.insertSheet(SHEET_CREATE);
  }
  if (create.getLastRow() === 0) {
    create.appendRow([
      'Timestamp', 'Name', 'Path', 'Option',
      'One-line Claim', 'Evidence of Work', 'Link',
      'Ethics Confirmed', 'Reflection'
    ]);
    create.getRange(1, 1, 1, 9).setFontWeight('bold');
    create.setFrozenRows(1);
  }

  // Sheet 3: Collab
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
