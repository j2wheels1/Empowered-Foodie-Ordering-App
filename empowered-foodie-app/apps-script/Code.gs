/**
 * Empowered Foodie — Orders receiver
 *
 * What this does: receives order-request submissions from the website
 * and appends each one as a new row in a Sheet called "Orders".
 * No payment or financial data is handled anywhere in this script.
 *
 * SETUP: see README.md in the project root for full step-by-step
 * instructions. Short version:
 *   1. Create a Google Sheet, add a tab named exactly "Orders"
 *   2. Paste the header row below into row 1 of that tab
 *   3. Extensions > Apps Script, replace the default code with this file
 *   4. Deploy > New deployment > Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   5. Copy the Web App URL into ORDERS_ENDPOINT_URL in assets/config.js
 */

const SHEET_NAME = "Orders";

// Row 1 of the "Orders" tab should read exactly:
// Timestamp | Name | Email | Phone | Items | Allergies | Preferences | Notes

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const p = e.parameter || {};

  sheet.appendRow([
    new Date(),
    p.name || "",
    p.email || "",
    p.phone || "",
    p.items || "",
    p.allergies || "",
    p.preferences || "",
    p.notes || "",
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ result: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lets you open the Web App URL directly in a browser to confirm it's live.
function doGet() {
  return ContentService
    .createTextOutput("Empowered Foodie orders endpoint is running.")
    .setMimeType(ContentService.MimeType.TEXT);
}
