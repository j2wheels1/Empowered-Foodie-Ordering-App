/**
 * Empowered Foodie — Orders receiver
 *
 * What this does: receives order-request submissions from the website,
 * appends each one as a new row in a Sheet called "Orders", emails the
 * client a confirmation, emails you (the script owner) so you know an
 * order came in, texts you via your carrier's email-to-SMS gateway,
 * keeps a running per-client record of allergies and preferences that
 * your staff can reference — with zero contact info ever visible to
 * them, kept in a completely separate Google Sheet file from Orders —
 * AND lets clients view their own order history on the site via a
 * one-time emailed link, with no accounts or passwords involved. It
 * also automatically matches ordered dishes against your live reheat
 * instructions library and includes just those in the client's
 * confirmation email. It also gates first-time clients through a
 * short questionnaire before they can order — checked automatically
 * by email, so returning clients skip straight to ordering. No
 * payment or financial data is handled anywhere in this script.
 *
 * Email formatting matches your existing branded documents: navy,
 * bold-caps section headers and a centered bold/underlined footer (like
 * the client reheating sheets), plus servings-in-parentheses items and
 * red-flagged allergies (like the internal production sheets).
 *
 * SETUP: see README.md in the project root for full step-by-step
 * instructions. Short version:
 *   1. Create a Google Sheet, add a tab named exactly "Orders"
 *   2. Paste the header row below into row 1 of that tab
 *   3. Add a second tab in the SAME sheet named exactly "Client
 *      Contacts" — this one stays private, never shared with staff
 *   4. Add a third tab in the SAME sheet named exactly "History
 *      Tokens" — also private, powers the order-history feature
 *   5. Add a fourth tab in the SAME sheet named exactly
 *      "Questionnaire Responses" — also private, powers the
 *      first-time questionnaire feature
 *   6. Create a SEPARATE, second Google Sheet file for "Client
 *      Profiles" — this is the one you share with your team
 *   7. Extensions > Apps Script (on the Orders sheet), replace the
 *      default code with this file
 *   8. Paste the Client Profiles sheet's ID into
 *      CLIENT_PROFILES_SPREADSHEET_ID below
 *   9. Run the testEmailPermission function once manually (see below)
 *  10. Deploy > New deployment > Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *  11. Copy the Web App URL into ORDERS_ENDPOINT_URL in assets/config.js
 */

const SHEET_NAME = "Orders";
const CLIENT_CONTACTS_SHEET_NAME = "Client Contacts";
const CLIENT_PROFILES_SHEET_NAME = "Client Profiles";
const HISTORY_TOKENS_SHEET_NAME = "History Tokens";
const QUESTIONNAIRE_SHEET_NAME = "Questionnaire Responses";
const BUSINESS_NAME = "Empowered Foodie";
const BRAND_NAVY = "#161455";
const BRAND_ALERT = "#a83b32";

// Your live site's base URL — used to build the order-history link
// emailed to clients. Update this if you ever rename the repo or move
// to a custom domain.
const SITE_URL = "https://j2wheels1.github.io/Empowered-Foodie-Ordering-App/";

// How long an order-history link stays valid after being requested.
const HISTORY_LINK_VALID_HOURS = 24;

// Where the reheat instructions live — a plain CSV file on your site
// (not a Google Sheet), fetched fresh each time a confirmation email
// goes out so it's always matched against your current reheat library.
const REHEAT_CSV_URL = SITE_URL + "assets/reheat-instructions.csv";

// The Client Profiles tab lives in a SEPARATE Google Sheet file from
// this one — not just a different tab — because Google Sheets shares
// access to an entire file at once, not per-tab. Keeping it in its own
// file is what actually keeps your staff from ever seeing the Orders
// sheet or the private Client Contacts tab, even though both are
// updated by this same script. Create that separate sheet, share it
// with your team, then paste its ID here (the long string in its URL:
// docs.google.com/spreadsheets/d/THIS_PART/edit).
const CLIENT_PROFILES_SPREADSHEET_ID = "PASTE_CLIENT_PROFILES_SHEET_ID_HERE";

// Sends a text to your phone via your carrier's email-to-SMS gateway —
// free, no separate service needed. If you switch carriers, just update
// the domain after the @ symbol. Common ones:
//   Verizon:   yournumber@vtext.com
//   AT&T:      yournumber@txt.att.net
//   T-Mobile:  yournumber@tmomail.net
const CHEF_TEXT_GATEWAY = "8455180401@tmomail.net";

// Row 1 of the "Orders" tab (in THIS spreadsheet) should read exactly:
// Timestamp | Name | Email | Phone | Items | Allergies | Preferences | Notes

// Row 1 of the "Client Contacts" tab (also in THIS spreadsheet — private,
// chef-only, never shared) should read exactly:
// Name | Email | Phone | Last Updated

// Row 1 of the "Client Profiles" tab (in the SEPARATE spreadsheet you
// share with staff) should read exactly:
// Name | Allergies | Preferences | Standing Notes | Last Updated
// No email or phone column exists here at all — staff never see contact
// info, by design, regardless of what access level you give them.

// Row 1 of the "History Tokens" tab (also in THIS spreadsheet — private)
// should read exactly:
// Token | Email | Created At | Expires At
// This powers the "view my order history" feature on the site: a
// client requests access by email, gets a one-time link (no password
// or account needed), and that link is the only way to see their own
// order history — nobody can see anyone else's just by guessing an
// email address.

// Row 1 of the "Questionnaire Responses" tab (also in THIS
// spreadsheet — private) should read exactly:
// Timestamp | Name | Email | Cuisine | Spice Level | Likes | Dislikes | Allergies
// Powers the first-time questionnaire on start-order.html — a new
// client fills this out once before their first order; the answers
// land here, and their email is immediately added to Client Contacts
// so they're never asked again on a later visit.

function doPost(e) {
  const p = e.parameter || {};

  if (p.action === "requestHistory") {
    try {
      handleHistoryRequest(p);
    } catch (err) {
      Logger.log("handleHistoryRequest failed: " + err);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ result: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === "submitQuestionnaire") {
    try {
      handleQuestionnaireSubmit(p);
    } catch (err) {
      Logger.log("handleQuestionnaireSubmit failed: " + err);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ result: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

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

  let confirmationError = "";
  try {
    sendConfirmationEmail(p);
  } catch (err) {
    // If something in the confirmation email throws all the way up
    // (rather than being caught internally), catch it here so it
    // doesn't block the rest of the order, and surface it in the chef
    // notification below so it's visible without digging through logs.
    confirmationError = String(err);
    Logger.log("sendConfirmationEmail top-level failed: " + err);
  }
  p._confirmationError = confirmationError;

  sendChefNotification(p);
  sendChefTextNotification(p);

  try {
    updateClientProfile(p);
  } catch (err) {
    // Order + emails already handled above; a profile-update failure
    // shouldn't block any of that.
    Logger.log("updateClientProfile failed: " + err);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ result: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Order history (magic-link access, no accounts) ----------

// Creates a random, unguessable token tied to an email address, valid
// for HISTORY_LINK_VALID_HOURS, and returns it. Returns null if the
// History Tokens tab isn't set up yet.
function createHistoryToken(email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_TOKENS_SHEET_NAME);
  if (!sheet) return null;

  const token = Utilities.getUuid();
  const now = new Date();
  const expires = new Date(now.getTime() + HISTORY_LINK_VALID_HOURS * 60 * 60 * 1000);
  sheet.appendRow([token, email.trim().toLowerCase(), now, expires]);
  return token;
}

// Looks up a token and returns the email it belongs to, but only if it
// hasn't expired. Returns null for an unknown or expired token.
function validateHistoryToken(token) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_TOKENS_SHEET_NAME);
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === token) {
      const expires = new Date(data[i][3]);
      if (expires < now) return null; // expired
      return String(data[i][1]).trim();
    }
  }
  return null;
}

// Emails a client their one-time order-history link. Triggered by the
// "Order History" page's request form (action=requestHistory).
function handleHistoryRequest(p) {
  if (!p.email) return;

  const token = createHistoryToken(p.email);
  if (!token) {
    Logger.log("History Tokens tab not set up yet — see README.md.");
    return;
  }

  const link = `${SITE_URL}history.html?token=${token}`;

  const html = `
    <div style="font-family:'Times New Roman', Times, serif; font-size:15px; color:#20222b; max-width:560px; margin:0 auto;">
      <p>Hi there,</p>
      <p>Here's your link to view your order history with ${BUSINESS_NAME}:</p>
      <p style="margin:22px 0;"><a href="${link}" style="color:${BRAND_NAVY};font-weight:bold;">View My Order History</a></p>
      <p style="color:#63667a;font-size:13px;">This link works for ${HISTORY_LINK_VALID_HOURS} hours. If you didn't request this, you can safely ignore this email.</p>
      <p style="text-align:center; font-weight:bold; text-decoration:underline; color:${BRAND_NAVY}; margin-top:26px;">Infused with Love by ${BUSINESS_NAME}</p>
    </div>
  `;

  const plain = [
    `Here's your link to view your order history with ${BUSINESS_NAME}:`,
    "",
    link,
    "",
    `This link works for ${HISTORY_LINK_VALID_HOURS} hours. If you didn't request this, you can safely ignore this email.`,
    "",
    `Infused with Love by ${BUSINESS_NAME}`,
  ].join("\n");

  try {
    MailApp.sendEmail({
      to: p.email,
      subject: `${BUSINESS_NAME} — Your Order History Link`,
      body: plain,
      htmlBody: html,
    });
  } catch (err) {
    Logger.log("sendHistoryLinkEmail failed: " + err);
  }
}

// Returns every Orders row matching this email, newest first, as plain
// objects ready to send back as JSON.
function getOrdersForEmail(email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const targetEmail = email.trim().toLowerCase();
  const orders = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim().toLowerCase() === targetEmail) {
      orders.push({
        timestamp: data[i][0] ? new Date(data[i][0]).toISOString() : "",
        name: data[i][1] || "",
        items: data[i][4] || "",
        allergies: data[i][5] || "",
        preferences: data[i][6] || "",
        notes: data[i][7] || "",
      });
    }
  }

  orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return orders;
}

// ---------- Client Profiles (private allergy/preference tracking) ----------

// Splits a comma-separated string into a clean list, trimmed and with
// empty entries removed.
function splitList(str) {
  return String(str || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Merges two lists of values, keeping every item from `existing` and
// adding anything from `incoming` that isn't already present
// (case-insensitive comparison, so "Dairy" and "dairy" count as the
// same item). Never removes anything — this only ever adds.
function mergeUnique(existing, incoming) {
  const result = existing.slice();
  incoming.forEach((item) => {
    const alreadyPresent = result.some((r) => r.toLowerCase() === item.toLowerCase());
    if (!alreadyPresent) result.push(item);
  });
  return result;
}

// Opens the Client Profiles tab in its separate spreadsheet file. Skips
// quietly (returns null) if the ID hasn't been set yet or the sheet
// can't be opened — better to silently skip the profile update than
// break order saving over a setup step that hasn't happened yet.
function getClientProfilesSheet() {
  if (!CLIENT_PROFILES_SPREADSHEET_ID || CLIENT_PROFILES_SPREADSHEET_ID.indexOf("PASTE_") === 0) {
    return null;
  }
  try {
    return SpreadsheetApp.openById(CLIENT_PROFILES_SPREADSHEET_ID).getSheetByName(CLIENT_PROFILES_SHEET_NAME);
  } catch (err) {
    Logger.log("Could not open Client Profiles spreadsheet: " + err);
    return null;
  }
}

// Looks up (or creates) a row in the private "Client Contacts" tab in
// THIS spreadsheet, matched by email. Returns the canonical name on
// file for this client, so the same person is always tracked under one
// consistent name in Client Profiles even if they type their name
// slightly differently on a later order (e.g. "Liz" vs "Elizabeth
// Burke") — whichever name they used first is the one that sticks.
function findOrCreateContact(p) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CLIENT_CONTACTS_SHEET_NAME);
  if (!sheet) return p.name || ""; // tab not set up yet — fall back to the submitted name

  const data = sheet.getDataRange().getValues();
  const targetEmail = p.email.trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === targetEmail) {
      const sheetRow = i + 1;
      if (p.phone && !String(data[i][2]).trim()) sheet.getRange(sheetRow, 3).setValue(p.phone);
      sheet.getRange(sheetRow, 4).setValue(new Date());
      return String(data[i][0]).trim() || p.name || "";
    }
  }

  sheet.appendRow([p.name || "", p.email || "", p.phone || "", new Date()]);
  return p.name || "";
}

// Read-only check: does this email already have a Client Contacts
// entry? Used by the start-order gate page to decide whether to show
// the first-time questionnaire or skip straight to ordering.
function checkClientExists(email) {
  if (!email) return false;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CLIENT_CONTACTS_SHEET_NAME);
  if (!sheet) return false;

  const data = sheet.getDataRange().getValues();
  const target = email.trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === target) return true;
  }
  return false;
}

// Returns this client's MOST RECENT questionnaire answers (Questionnaire
// Responses is append-only — every submission adds a new row — so this
// scans all matches and keeps the last one, since rows are appended in
// chronological order). Returns null if no submission exists yet.
// Used by the "My Foodie Profile" page to pre-fill the edit form.
function getLatestQuestionnaire(email) {
  if (!email) return null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QUESTIONNAIRE_SHEET_NAME);
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  const target = email.trim().toLowerCase();
  let latest = null;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim().toLowerCase() === target) {
      latest = {
        name: data[i][1] || "",
        cuisine: data[i][3] || "",
        spiceLevel: data[i][4] || "",
        likes: data[i][5] || "",
        dislikes: data[i][6] || "",
        allergies: data[i][7] || "",
      };
    }
  }

  return latest;
}

// Saves a first-time client's questionnaire answers to the private
// "Questionnaire Responses" tab, AND immediately creates their Client
// Contacts entry — that second part matters: it means they won't be
// asked the questionnaire again even if they fill it out but don't
// complete an order right away in the same visit.
function handleQuestionnaireSubmit(p) {
  if (!p.email) return;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QUESTIONNAIRE_SHEET_NAME);
  if (sheet) {
    sheet.appendRow([
      new Date(),
      p.name || "",
      p.email || "",
      p.cuisine || "",
      p.spiceLevel || "",
      p.likes || "",
      p.dislikes || "",
      p.allergies || "",
    ]);
  } else {
    Logger.log("Questionnaire Responses tab not set up yet — see README.md.");
  }

  findOrCreateContact({ name: p.name || "", email: p.email, phone: "" });

  try {
    updateClientProfileFromQuestionnaire(p);
  } catch (err) {
    // Contact + questionnaire log already saved above; a Client
    // Profiles update failure shouldn't block any of that.
    Logger.log("updateClientProfileFromQuestionnaire failed: " + err);
  }
}

// Feeds a first-time client's questionnaire answers into the
// staff-facing Client Profiles sheet — same tab a real order updates,
// matched the same way (by canonical name via Client Contacts).
// Allergies merge in exactly like a real order's allergies would.
// Cuisine and spice level become informal "preferences." Likes and
// dislikes aren't a clean fit for either column, so they seed the
// Standing Notes field instead — but ONLY if it's currently blank,
// since that column is otherwise yours to maintain by hand and this
// shouldn't overwrite anything you've already written there.
function updateClientProfileFromQuestionnaire(p) {
  const canonicalName = findOrCreateContact({ name: p.name || "", email: p.email, phone: "" });
  if (!canonicalName) return;

  const sheet = getClientProfilesSheet();
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const targetName = canonicalName.trim().toLowerCase();

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === targetName) {
      rowIndex = i;
      break;
    }
  }

  const newAllergies = splitList(p.allergies);
  const preferenceBits = [];
  if (p.cuisine) preferenceBits.push(`Favorite cuisine: ${p.cuisine}`);
  if (p.spiceLevel) preferenceBits.push(`Spice level: ${p.spiceLevel}`);

  const noteBits = [];
  if (p.likes) noteBits.push(`Likes: ${p.likes}`);
  if (p.dislikes) noteBits.push(`Dislikes: ${p.dislikes}`);
  const questionnaireNote = noteBits.join("; ");

  if (rowIndex === -1) {
    sheet.appendRow([
      canonicalName,
      newAllergies.join(", "),
      preferenceBits.join(", "),
      questionnaireNote,
      new Date(),
    ]);
    return;
  }

  const sheetRow = rowIndex + 1;
  const existingAllergies = splitList(data[rowIndex][1]);
  const existingPreferences = splitList(data[rowIndex][2]);
  const existingNotes = String(data[rowIndex][3] || "").trim();

  sheet.getRange(sheetRow, 2).setValue(mergeUnique(existingAllergies, newAllergies).join(", "));
  sheet.getRange(sheetRow, 3).setValue(mergeUnique(existingPreferences, preferenceBits).join(", "));
  if (!existingNotes && questionnaireNote) {
    sheet.getRange(sheetRow, 4).setValue(questionnaireNote);
  }
  sheet.getRange(sheetRow, 5).setValue(new Date());
}

// Creates or updates a row in the staff-facing Client Profiles sheet
// for this client, matched by NAME (looked up via the private Client
// Contacts tab, so matching is still reliably keyed off email behind
// the scenes — staff just never see that part). New clients get a new
// row; returning clients get their allergies and preferences ADDED to
// (never replaced or removed) — so the profile only grows more
// complete over time. Standing Notes is left alone by this function
// entirely; that column is for you to maintain by hand (it's where
// your imported cheat-sheet notes live), separate from per-order notes.
function updateClientProfile(p) {
  if (!p.email) return; // still needed to find/create the private contact record

  const canonicalName = findOrCreateContact(p);
  if (!canonicalName) return;

  const sheet = getClientProfilesSheet();
  if (!sheet) return; // Client Profiles sheet not connected yet — skip quietly

  const data = sheet.getDataRange().getValues();
  const targetName = canonicalName.trim().toLowerCase();

  let rowIndex = -1; // 0-indexed within `data`, header is row 0
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === targetName) {
      rowIndex = i;
      break;
    }
  }

  const newAllergies = splitList(p.allergies);
  const newPreferences = splitList(p.preferences);

  if (rowIndex === -1) {
    // New client — add a fresh row. Standing Notes starts blank; add it
    // by hand later if there's something worth tracking long-term.
    sheet.appendRow([
      canonicalName,
      newAllergies.join(", "),
      newPreferences.join(", "),
      "",
      new Date(),
    ]);
    return;
  }

  // Existing client — merge in anything new and update the timestamp.
  const sheetRow = rowIndex + 1; // convert back to 1-indexed sheet row
  const existingAllergies = splitList(data[rowIndex][1]);
  const existingPreferences = splitList(data[rowIndex][2]);

  sheet.getRange(sheetRow, 2).setValue(mergeUnique(existingAllergies, newAllergies).join(", "));
  sheet.getRange(sheetRow, 3).setValue(mergeUnique(existingPreferences, newPreferences).join(", "));
  sheet.getRange(sheetRow, 5).setValue(new Date());
}

// Run this manually to send a sample order through updateClientProfile
// without a real submission, to confirm both sheets are set up
// correctly. Run it twice in a row — the second run should update the
// same "Test Client" row in both Client Contacts and Client Profiles
// rather than creating duplicates, which confirms the matching logic
// is working end to end.
function testClientProfileUpdate() {
  updateClientProfile(sampleOrderData());
  Logger.log("Check Client Contacts (this spreadsheet) and Client Profiles (the separate sheet) for a row for Test Client.");
}

// ---------- Shared formatting helpers ----------

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Categories sold as a whole batch rather than by individual serving —
// matches the same logic the ordering page itself uses to decide which
// categories show a servings field.
const BATCH_CATEGORIES = ["breakfast", "baked goods", "dip", "soup"];

function isBatchCategory(category) {
  const lower = category.toLowerCase();
  return BATCH_CATEGORIES.some((kw) => lower.includes(kw));
}

// Parses the flattened "Item (Category) — N servings; Item2 (Category2)"
// string the site sends into { category: [{name, servings}] }, so it can
// be rendered grouped by category with servings-first-in-parentheses,
// matching your production sheet convention.
function parseItemsForDisplay(itemsString) {
  const byCategory = {};
  if (!itemsString) return byCategory;

  itemsString.split(";").map((s) => s.trim()).filter(Boolean).forEach((entry) => {
    const match = entry.match(/^(.*?)\s\(([^)]+)\)(?:\s—\s(\d+)\sservings)?$/);
    let name = entry, category = "Items", servings = "";
    if (match) {
      name = match[1];
      category = match[2];
      servings = match[3] || "";
    }
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push({ name: name, servings: servings });
  });

  return byCategory;
}

// Renders parsed items as an HTML block: bold-caps navy category
// headers (marked "served by the batch" for batch categories), each
// item as "(N servings) Name" for categories sold by serving count.
function itemsToHtml(itemsString) {
  const byCategory = parseItemsForDisplay(itemsString);
  const categories = Object.keys(byCategory);
  if (!categories.length) return "";

  let html = "";
  categories.forEach((cat) => {
    const batchNote = isBatchCategory(cat)
      ? ' <span style="font-weight:normal;text-transform:none;font-style:italic;color:#8a8d9c;">— served by the batch</span>'
      : "";
    html += `<p style="margin:16px 0 4px;font-weight:bold;text-transform:uppercase;letter-spacing:0.03em;color:${BRAND_NAVY};">${escapeHtml(cat)}${batchNote}</p>`;
    html += '<ul style="margin:0 0 0 20px;padding:0;">';
    byCategory[cat].forEach((item) => {
      const prefix = item.servings ? `(${item.servings} servings) ` : "";
      html += `<li style="margin-bottom:3px;">${prefix}<strong>${escapeHtml(item.name)}</strong></li>`;
    });
    html += "</ul>";
  });
  return html;
}

// Plain-text equivalent of itemsToHtml, used as the fallback body for
// email clients that don't render HTML.
function itemsToPlainText(itemsString) {
  const byCategory = parseItemsForDisplay(itemsString);
  const categories = Object.keys(byCategory);
  if (!categories.length) return "";

  let text = "";
  categories.forEach((cat) => {
    const note = isBatchCategory(cat) ? " (served by the batch)" : "";
    text += `${cat.toUpperCase()}${note}\n`;
    byCategory[cat].forEach((item) => {
      const prefix = item.servings ? `(${item.servings} servings) ` : "";
      text += `${prefix}${item.name}\n`;
    });
    text += "\n";
  });
  return text.trim();
}

function formattedDate() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEEE, MMMM d, yyyy");
}

// ---------- Reheat instructions matching ----------

// Fetches and parses the live reheat instructions CSV from the site.
// Returns an array of {category, dish, instructions}, or an empty
// array if the fetch or parse fails for any reason — a hiccup here
// should never block an order or its confirmation email.
// Set by fetchReheatLibrary each time it runs, so doPost can report
// what actually happened via the chef notification (a channel we know
// reliably arrives) rather than requiring a trip into the Executions
// log to diagnose a silent failure.
let lastReheatFetchStatus = "";

function fetchReheatLibrary() {
  try {
    const response = UrlFetchApp.fetch(REHEAT_CSV_URL, { muteHttpExceptions: true });
    const code = response.getResponseCode();
    if (code !== 200) {
      lastReheatFetchStatus = `HTTP ${code} fetching ${REHEAT_CSV_URL}`;
      return [];
    }

    const rows = Utilities.parseCsv(response.getContentText());
    if (!rows.length) {
      lastReheatFetchStatus = "Fetched OK but CSV had no rows";
      return [];
    }

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const catIdx = headers.indexOf("category");
    const dishIdx = headers.indexOf("dish");
    const instrIdx = headers.indexOf("instructions");
    if (dishIdx === -1) {
      lastReheatFetchStatus = "Fetched OK but no 'Dish' column found in headers: " + headers.join(", ");
      return [];
    }

    const parsed = rows
      .slice(1)
      .map((row) => ({
        category: catIdx > -1 ? (row[catIdx] || "").trim() : "",
        dish: (row[dishIdx] || "").trim(),
        instructions: instrIdx > -1 ? (row[instrIdx] || "").trim() : "",
      }))
      .filter((r) => r.dish);

    lastReheatFetchStatus = `Fetched OK — ${parsed.length} dishes loaded`;
    return parsed;
  } catch (err) {
    lastReheatFetchStatus = "Exception: " + err;
    Logger.log("fetchReheatLibrary failed: " + err);
    return [];
  }
}

// Pulls just the dish names out of the "Item (Category) — N servings;
// ..." items string an order was submitted with.
function extractOrderedDishNames(itemsString) {
  if (!itemsString) return [];
  return itemsString
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.*?)\s\(([^)]+)\)/);
      return match ? match[1].trim() : entry;
    });
}

// Matches ordered dish names against the reheat library using a loose,
// case-insensitive substring match in either direction — menu names
// and reheat library names aren't always phrased identically (e.g. a
// menu item might add a description the reheat library entry doesn't
// have, or vice versa), so an exact match would miss too much.
// Pulls out the "title" portion of a dish name — everything before
// the first " with " or first comma, whichever comes first. Most dish
// names follow a "Title with ingredient, ingredient, ..." pattern, so
// comparing just the title is far more forgiving of small ingredient-
// list wording differences between the menu and the reheat library
// than comparing the entire string.
function dishTitle(name) {
  const lower = name.toLowerCase();
  const withIdx = lower.indexOf(" with ");
  const commaIdx = lower.indexOf(",");
  const candidates = [withIdx, commaIdx].filter((i) => i !== -1);
  const cut = candidates.length ? Math.min.apply(null, candidates) : -1;
  return (cut === -1 ? name : name.slice(0, cut)).trim().toLowerCase();
}

function matchReheatInstructions(itemsString) {
  const library = fetchReheatLibrary();
  if (!library.length) return [];

  const orderedNames = extractOrderedDishNames(itemsString);
  const matches = [];
  const seenDishes = {};

  orderedNames.forEach((orderedName) => {
    const lowerOrdered = orderedName.toLowerCase();
    const orderedTitle = dishTitle(orderedName);

    const found = library.find((entry) => {
      const lowerDish = entry.dish.toLowerCase();
      // Try the full-string loose match first...
      if (lowerOrdered.indexOf(lowerDish) !== -1 || lowerDish.indexOf(lowerOrdered) !== -1) {
        return true;
      }
      // ...and fall back to matching just the dish title, which
      // tolerates ingredient-list wording differences.
      return dishTitle(entry.dish) === orderedTitle;
    });

    if (found && !seenDishes[found.dish]) {
      seenDishes[found.dish] = true;
      matches.push(found);
    }
  });

  return matches;
}

// Renders matched reheat instructions as an HTML block, styled to
// match the rest of the client confirmation email.
function reheatMatchesToHtml(matches) {
  if (!matches.length) return "";
  let html = `<p style="margin:16px 0 4px;font-weight:bold;text-transform:uppercase;letter-spacing:0.03em;color:${BRAND_NAVY};">Reheat Instructions</p>`;
  matches.forEach((m) => {
    html += `<p style="margin:8px 0 2px;"><strong>${escapeHtml(m.dish)}</strong></p>`;
    html += `<p style="margin:0 0 4px;color:#63667a;font-size:0.92rem;">${escapeHtml(m.instructions)}</p>`;
  });
  return html;
}

// Plain-text equivalent of reheatMatchesToHtml.
function reheatMatchesToPlainText(matches) {
  if (!matches.length) return "";
  let text = "REHEAT INSTRUCTIONS\n";
  matches.forEach((m) => {
    text += `${m.dish}: ${m.instructions}\n`;
  });
  return text.trim();
}

// ---------- Client confirmation email ----------

// Emails the client a confirmation of what they submitted, styled to
// match your reheating sheets (Times New Roman, navy bold-caps headers,
// centered bold/underlined footer) with production-sheet-style item and
// allergy formatting. Wrapped in try/catch so a failed email never
// blocks the order from being saved.
function sendConfirmationEmail(p) {
  if (!p.email) return;

  const itemsHtml = itemsToHtml(p.items);
  const reheatMatches = matchReheatInstructions(p.items);
  const reheatHtml = reheatMatchesToHtml(reheatMatches);

  let html = `
    <div style="font-family:'Times New Roman', Times, serif; font-size:15px; color:#20222b; max-width:560px; margin:0 auto;">
      <p style="font-weight:bold; font-size:17px; color:${BRAND_NAVY}; margin-bottom:2px;">${escapeHtml(p.name || "Order")}</p>
      <p style="margin-top:0; color:#63667a;">${formattedDate()}</p>
      <p>Thanks — we received your order request! Here's what you sent us:</p>
      ${itemsHtml}
      ${reheatHtml}
  `;

  if (p.allergies) {
    html += `<p style="margin:16px 0 4px;font-weight:bold;text-transform:uppercase;letter-spacing:0.03em;color:${BRAND_ALERT};">Allergies</p>`;
    html += `<p style="margin:0;font-weight:bold;color:${BRAND_ALERT};">${escapeHtml(p.allergies)}</p>`;
  }
  if (p.preferences) {
    html += `<p style="margin:16px 0 4px;font-weight:bold;text-transform:uppercase;letter-spacing:0.03em;color:${BRAND_NAVY};">Dietary Preferences</p>`;
    html += `<p style="margin:0;">${escapeHtml(p.preferences)}</p>`;
  }
  if (p.notes) {
    html += `<p style="margin:16px 0 4px;font-weight:bold;text-transform:uppercase;letter-spacing:0.03em;color:${BRAND_NAVY};">Notes</p>`;
    html += `<p style="margin:0;">${escapeHtml(p.notes)}</p>`;
  }

  html += `
      <p style="margin-top:22px; color:#63667a;">This is a request only. Payment is collected at time of delivery.</p>
      <p style="text-align:center; font-weight:bold; text-decoration:underline; color:${BRAND_NAVY}; margin-top:26px;">Infused with Love by ${BUSINESS_NAME}</p>
    </div>
  `;

  // Plain-text fallback for email clients that don't render HTML.
  const plainLines = [
    `${p.name || "Order"} — ${formattedDate()}`,
    "",
    "Thanks — we received your order request! Here's what you sent us:",
    "",
  ];
  const itemsPlain = itemsToPlainText(p.items);
  if (itemsPlain) plainLines.push(itemsPlain, "");
  const reheatPlain = reheatMatchesToPlainText(reheatMatches);
  if (reheatPlain) plainLines.push(reheatPlain, "");
  if (p.allergies) plainLines.push(`Allergies: ${p.allergies}`);
  if (p.preferences) plainLines.push(`Dietary preferences: ${p.preferences}`);
  if (p.notes) plainLines.push(`Notes: ${p.notes}`);
  plainLines.push(
    "",
    "This is a request only. Payment is collected at time of delivery.",
    "",
    `Infused with Love by ${BUSINESS_NAME}`
  );

  try {
    // Uses GmailApp rather than MailApp — testing showed MailApp
    // silently failed to deliver to external addresses in this
    // project (no error, no bounce, never arrived), while GmailApp
    // delivered reliably. GmailApp sends through Gmail's own
    // infrastructure directly rather than the generic mail relay
    // MailApp uses under the hood.
    GmailApp.sendEmail(
      p.email,
      `${BUSINESS_NAME} — Order Request Received`,
      plainLines.join("\n"),
      { htmlBody: html }
    );
  } catch (err) {
    // Logged here, then re-thrown so doPost's outer try/catch can
    // surface it in the chef notification email — previously this was
    // swallowed silently here and never visible anywhere.
    Logger.log("sendConfirmationEmail failed: " + err);
    throw err;
  }
}

// ---------- Chef notification email ----------

// Notifies you (whichever Google account owns this script/deployment)
// whenever a new order comes in, so you don't have to keep checking the
// sheet manually. Styled closer to your internal production sheets
// (plain sans-serif, compact) since this one's for you, not a client.
// Uses Session.getEffectiveUser().getEmail() so there's nothing to
// configure — it automatically goes to you.
function sendChefNotification(p) {
  const itemsHtml = itemsToHtml(p.items);

  let html = `
    <div style="font-family:Calibri, Arial, sans-serif; font-size:14px; color:#20222b; max-width:560px;">
      <p style="font-weight:bold; font-size:16px; margin-bottom:2px;">New order — ${escapeHtml(p.name || "Empowered Foodie")}</p>
      <p style="margin-top:0; color:#63667a;">${formattedDate()}</p>
      <p style="margin:0;"><strong>Email:</strong> ${escapeHtml(p.email || "")}</p>
      <p style="margin:0;"><strong>Phone:</strong> ${escapeHtml(p.phone || "")}</p>
      ${itemsHtml}
  `;

  if (p._confirmationError) {
    html += `<p style="margin:16px 0 4px;font-weight:bold;text-transform:uppercase;color:${BRAND_ALERT};">Confirmation Email Failed</p>`;
    html += `<p style="margin:0;color:${BRAND_ALERT};font-family:monospace;font-size:12px;">${escapeHtml(p._confirmationError)}</p>`;
    html += `<p style="margin:4px 0 0;color:#63667a;font-size:12px;">The client may not have received their confirmation email for this order — you may want to follow up directly.</p>`;
  }

  html += `<p style="margin:16px 0 0;color:#8a8d9c;font-size:11px;font-family:monospace;">Reheat library: ${escapeHtml(lastReheatFetchStatus)}</p>`;

  if (p.allergies) {
    html += `<p style="margin:16px 0 4px;font-weight:bold;text-transform:uppercase;color:${BRAND_ALERT};">Allergies</p>`;
    html += `<p style="margin:0;font-weight:bold;color:${BRAND_ALERT};">${escapeHtml(p.allergies)}</p>`;
  }
  if (p.preferences) {
    html += `<p style="margin:16px 0 4px;font-weight:bold;text-transform:uppercase;">Dietary Preferences</p>`;
    html += `<p style="margin:0;">${escapeHtml(p.preferences)}</p>`;
  }
  if (p.notes) {
    html += `<p style="margin:16px 0 4px;font-weight:bold;text-transform:uppercase;">Notes</p>`;
    html += `<p style="margin:0;">${escapeHtml(p.notes)}</p>`;
  }

  html += `
      <p style="margin-top:20px; color:#63667a; font-size:12px;">Full details are also saved in your Orders sheet.</p>
    </div>
  `;

  const plainLines = [
    `New order request from ${p.name || "a client"}.`,
    "",
    `Name: ${p.name || ""}`,
    `Email: ${p.email || ""}`,
    `Phone: ${p.phone || ""}`,
    "",
  ];
  const itemsPlain = itemsToPlainText(p.items);
  if (itemsPlain) plainLines.push(itemsPlain, "");
  if (p._confirmationError) {
    plainLines.push(
      "CONFIRMATION EMAIL FAILED:",
      p._confirmationError,
      "The client may not have received their confirmation email for this order — you may want to follow up directly.",
      ""
    );
  }
  if (p.allergies) plainLines.push(`Allergies: ${p.allergies}`);
  if (p.preferences) plainLines.push(`Dietary preferences: ${p.preferences}`);
  if (p.notes) plainLines.push(`Notes: ${p.notes}`);
  plainLines.push("", "Full details are also saved in your Orders sheet.");

  try {
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: `New order — ${p.name || "Empowered Foodie"}`,
      body: plainLines.join("\n"),
      htmlBody: html,
    });
  } catch (err) {
    // Order is already saved above; a failed email shouldn't block that.
    Logger.log("sendChefNotification failed: " + err);
  }
}

// Texts you via your carrier's email-to-SMS gateway (see
// CHEF_TEXT_GATEWAY above). Kept short on purpose — carrier gateways
// often truncate or split long messages, so this just flags that an
// order came in rather than repeating the full details already in the
// email and the sheet.
function sendChefTextNotification(p) {
  if (!CHEF_TEXT_GATEWAY) return;

  const message = `New Empowered Foodie order from ${p.name || "a client"}. Check email or Orders sheet.`;

  try {
    MailApp.sendEmail({
      to: CHEF_TEXT_GATEWAY,
      subject: "",
      body: message,
    });
  } catch (err) {
    Logger.log("sendChefTextNotification failed: " + err);
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
    to: Session.getEffectiveUser().getEmail(),
    subject: `${BUSINESS_NAME} test — email permission granted`,
    body: "If you got this, order confirmation and notification emails are ready to go.",
  });
}

// Run this manually to send yourself a test text via the carrier
// gateway, to confirm CHEF_TEXT_GATEWAY is set correctly.
function testTextNotification() {
  MailApp.sendEmail({
    to: CHEF_TEXT_GATEWAY,
    subject: "",
    body: `${BUSINESS_NAME} test text — if you got this, text notifications are working.`,
  });
}

// Sample order data for the two preview functions below.
function sampleOrderData() {
  return {
    name: "Test Client",
    email: Session.getEffectiveUser().getEmail(), // sends to yourself so you can preview it
    phone: "555-123-4567",
    items: "Greek Lemon Chicken Soup (Soups); Ground Beef Taco Pasta (Kids/Comfort Foods) — 2 servings; Summer Pasta Primavera (Main Dishes) — 3 servings",
    allergies: "Dairy, Gluten",
    preferences: "Vegetarian",
    notes: "Main Dishes: light on garlic",
  };
}

// Run this manually anytime you want to preview the CLIENT confirmation
// email's formatting without placing a real order on the site. Sends
// to your own inbox using sample data (see sampleOrderData above).
function testConfirmationEmailFormat() {
  sendConfirmationEmail(sampleOrderData());
}

// Run this manually to test sending a confirmation email to a SPECIFIC
// address (not your own inbox) directly from the editor. Used to
// compare against a real order to the same address — if this manual
// run delivers but a real order to the same address doesn't, that
// points to a difference between the manual-run and deployed-web-app
// execution contexts (the same category of issue as the earlier
// getActiveUser bug), not a problem with the address itself.
function testConfirmationEmailToAddress() {
  const data = sampleOrderData();
  data.email = "j2wheels@gmail.com";
  data.name = "Direct Editor Test";
  sendConfirmationEmail(data);
}

// Diagnostic only: tests sending via GmailApp instead of MailApp, to
// rule in/out whether MailApp specifically has an issue. GmailApp
// sends through Gmail's own infrastructure directly rather than the
// generic mail relay MailApp uses, and requires its own separate
// permission — running this the first time will likely show a NEW
// authorization prompt (approve it, same as the very first email
// permission grant). EDIT THE EMAIL ADDRESS BELOW before running.
function testViaGmailApp() {
  const testEmail = "PASTE_A_TEST_EMAIL_HERE";
  GmailApp.sendEmail(
    testEmail,
    "Empowered Foodie — GmailApp test",
    "If you got this, GmailApp can deliver where MailApp could not.",
    { htmlBody: "<p>If you got this, <strong>GmailApp</strong> can deliver where MailApp could not.</p>" }
  );
}

// Run this manually to confirm reheat instruction matching works end
// to end. Uses real dish names from the reheat library (rather than
// sampleOrderData's placeholder items, which won't match anything),
// sends the result to your own inbox so you can see exactly which
// instructions got matched and included.
function testReheatMatching() {
  sendConfirmationEmail({
    name: "Reheat Match Test",
    email: Session.getEffectiveUser().getEmail(),
    phone: "555-123-4567",
    items: "Grilled Salmon (Clean Eats — Proteins) — 2 servings; Jasmine Rice (Clean Eats — Starches) — 2 servings; Roasted Broccoli (Clean Eats — Veggies) — 2 servings",
    allergies: "",
    preferences: "",
    notes: "This is a test of reheat instruction matching.",
  });
}

// Run this manually anytime you want to preview the CHEF notification
// email's formatting the same way — this is the function that threw
// the "Cannot read properties of undefined" error if run directly
// with no data; use this instead for a quick preview.
function testChefNotificationFormat() {
  sendChefNotification(sampleOrderData());
}

// Run this manually anytime to check how many emails you have left to
// send today. Free Google accounts cap out around 100/day — if this
// shows 0, that's why emails stopped sending (they'll resume once the
// quota resets, roughly 24 hours after your first send of the day).
// Logs the number either way, and also tries to email it to you — but
// if quota is truly at 0, that email obviously can't send, so check
// Executions > this run > "View logs" if no email shows up.
function checkEmailQuota() {
  const remaining = MailApp.getRemainingDailyQuota();
  Logger.log("Remaining daily email quota: " + remaining);
  try {
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: `${BUSINESS_NAME} — Email quota check`,
      body: `Remaining emails you can send today: ${remaining}`,
    });
  } catch (err) {
    // If quota is 0 this send will itself fail — that's expected;
    // the Logger.log above still recorded the number either way.
  }
}

// Run this manually to test the order-history flow end to end without
// waiting on real emails: creates a token for your own email, logs the
// link it would send, then fetches the history data for that token —
// confirming History Tokens and the getHistory lookup both work.
function testHistoryFlow() {
  const email = Session.getEffectiveUser().getEmail();
  const token = createHistoryToken(email);
  if (!token) {
    Logger.log("Could not create a token — is the History Tokens tab set up?");
    return;
  }
  Logger.log("Link: " + SITE_URL + "history.html?token=" + token);
  Logger.log("Orders found for you: " + JSON.stringify(getOrdersForEmail(email)));
}

// Run this manually to test the questionnaire flow end to end without
// using the website. Uses a made-up test email so it won't collide
// with a real client. Checks "before" (should be false), submits a
// sample questionnaire, then checks "after" (should now be true) —
// confirming both the check and the submit-and-create-contact logic
// work correctly. Also updates Client Profiles, so check that sheet
// for a "Questionnaire Test" row with allergies/preferences/notes
// filled in from the sample data below.
function testQuestionnaireFlow() {
  const testEmail = "questionnaire-test@example.com";

  Logger.log("Exists before: " + checkClientExists(testEmail));

  handleQuestionnaireSubmit({
    name: "Questionnaire Test",
    email: testEmail,
    cuisine: "Thai",
    spiceLevel: "Spicy",
    likes: "Cilantro, coconut milk, citrus",
    dislikes: "Mushrooms",
    allergies: "Shellfish",
  });

  Logger.log("Exists after: " + checkClientExists(testEmail));
  Logger.log("Check the Questionnaire Responses tab and Client Contacts tab for the test row.");
}

// Lets you open the Web App URL directly in a browser to confirm it's
// live. Also serves order-history JSON when called with
// ?action=getHistory&token=... (used by history.html on the site).
function doGet(e) {
  const p = (e && e.parameter) || {};

  if (p.action === "getHistory") {
    const email = validateHistoryToken(p.token || "");
    if (!email) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: "This link has expired or is invalid. Please request a new one." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ orders: getOrdersForEmail(email) }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === "checkClient") {
    return ContentService
      .createTextOutput(JSON.stringify({ exists: checkClientExists(p.email || "") }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === "getQuestionnaire") {
    const profile = getLatestQuestionnaire(p.email || "");
    return ContentService
      .createTextOutput(JSON.stringify({ found: !!profile, profile: profile || {} }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput("Empowered Foodie orders endpoint is running.")
    .setMimeType(ContentService.MimeType.TEXT);
}
