/**
 * Empowered Foodie — Orders receiver
 *
 * What this does: receives order-request submissions from the website,
 * appends each one as a new row in a Sheet called "Orders", emails the
 * client a confirmation, AND emails you (the script owner) so you know
 * an order came in. No payment or financial data is handled anywhere
 * in this script.
 *
 * SETUP: see README.md in the project root for full step-by-step
 * instructions. Short version:
 *   1. Create a Google Sheet, add a tab named exactly "Orders"
 *   2. Paste the header row below into row 1 of that tab
 *   3. Extensions > Apps Script, replace the default code with this file
 *   4. Run the testEmailPermission function once manually (see below)
 *   5. Deploy > New deployment > Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   6. Copy the Web App URL into ORDERS_ENDPOINT_URL in assets/config.js
 */

const SHEET_NAME = "Orders";
const BUSINESS_NAME = "Empowered Foodie";

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

  sendConfirmationEmail(p);
  sendChefNotification(p);

  return ContentService
    .createTextOutput(JSON.stringify({ result: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Emails the client a confirmation of what they submitted. Wrapped in
// try/catch so that if email sending ever fails (bad address, quota,
// etc.) the order still gets saved to the sheet either way.
function sendConfirmationEmail(p) {
  if (!p.email) return;

  const lines = [
    `Hi ${p.name || "there"},`,
    "",
    "Thanks — we received your order request! Here's what you sent us:",
    "",
  ];

  if (p.items) lines.push(`Items: ${p.items}`);
  if (p.allergies) lines.push(`Allergies: ${p.allergies}`);
  if (p.preferences) lines.push(`Dietary preferences: ${p.preferences}`);
  if (p.notes) lines.push(`Notes: ${p.notes}`);

  lines.push(
    "",
    "This is a request only — no payment was collected. We'll follow up to confirm details and arrange payment.",
    "",
    `Infused with Love by ${BUSINESS_NAME}`
  );

  try {
    MailApp.sendEmail({
      to: p.email,
      subject: `${BUSINESS_NAME} — Order Request Received`,
      body: lines.join("\n"),
    });
  } catch (err) {
    // Order is already saved above; a failed email shouldn't block that.
  }
}

// Notifies you (whichever Google account owns this script/deployment)
// whenever a new order comes in, so you don't have to keep checking the
// sheet manually. Uses Session.getActiveUser().getEmail() so there's
// nothing to configure — it automatically goes to you.
function sendChefNotification(p) {
  const lines = [
    `New order request from ${p.name || "a client"}.`,
    "",
    `Name: ${p.name || ""}`,
    `Email: ${p.email || ""}`,
    `Phone: ${p.phone || ""}`,
  ];

  if (p.items) lines.push(`Items: ${p.items}`);
  if (p.allergies) lines.push(`Allergies: ${p.allergies}`);
  if (p.preferences) lines.push(`Dietary preferences: ${p.preferences}`);
  if (p.notes) lines.push(`Notes: ${p.notes}`);

  lines.push("", "Full details are also saved in your Orders sheet.");

  try {
    MailApp.sendEmail({
      to: Session.getActiveUser().getEmail(),
      subject: `New order — ${p.name || "Empowered Foodie"}`,
      body: lines.join("\n"),
    });
  } catch (err) {
    // Order is already saved above; a failed email shouldn't block that.
  }
}

// Run this ONCE manually: in the Apps Script editor toolbar, select
// "testEmailPermission" from the function dropdown and click Run. This
// triggers Google's one-time permission prompt for sending email —
// approve it, and both confirmation and notification emails will then
// work automatically when real orders come in through the deployed
// Web App.
function testEmailPermission() {
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: `${BUSINESS_NAME} test — email permission granted`,
    body: "If you got this, order confirmation and notification emails are ready to go.",
  });
}

// Lets you open the Web App URL directly in a browser to confirm it's live.
function doGet() {
  return ContentService
    .createTextOutput("Empowered Foodie orders endpoint is running.")
    .setMimeType(ContentService.MimeType.TEXT);
}
