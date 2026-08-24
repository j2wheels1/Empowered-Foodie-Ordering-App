/*
  CONFIG — this is the only file you need to touch to connect the app
  to your Google Sheet menu and your orders inbox. See README.md for
  full step-by-step setup instructions.
*/

window.EF_CONFIG = {
  // 1) MENU SOURCE
  // Publish your weekly menu Google Sheet to the web as a CSV, then
  // paste that URL here. Editing the sheet updates the live site —
  // no code changes, no redeploy.
  MENU_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ61rQdyqy3FV_132soqKWLzL-lJJXEvErcaUIFDsnG8XYQ6PobB3dh56G-y_h9AzJ3Ei6C-z6ic2T9/pub?output=csv",

  // 2) ORDER SUBMISSIONS
  // Paste the Web App URL you get after deploying the Apps Script in
  // /apps-script/Code.gs. This is where order requests get saved.
  ORDERS_ENDPOINT_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE",

  // Business info shown in the footer / confirmation message.
  BUSINESS_NAME: "Empowered Foodie",
  CONTACT_EMAIL: "hello@empoweredfoodie.com",
  TAGLINE: "Infused with Love by Empowered Foodie"
};
