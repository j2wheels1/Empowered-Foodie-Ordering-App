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
  MENU_CSV_URL: "https://docs.google.com/forms/d/1luwP2h2jUzjplF32wrhVdVUn1Hm0V-V80BnOM8n49Sc/edit",

  // 2) ORDER SUBMISSIONS
  // Paste the Web App URL you get after deploying the Apps Script in
  // /apps-script/Code.gs. This is where order requests get saved.
  ORDERS_ENDPOINT_URL: "https://script.google.com/macros/s/AKfycbyswqBwp6UpH0zYTPKjQwjgVlbsUUA8c_x58P1DGZVtoqwDC1bWElhfq8zYTSBCEGSN/exec",

  // Business info shown in the footer / confirmation message.
  BUSINESS_NAME: "Empowered Foodie",
  CONTACT_EMAIL: "chefcass@empoweredfoodie.com",
  TAGLINE: "Infused with Love by Empowered Foodie",

  // 3) REHEAT PAGE DATES
  // Shown next to "This Week's Reheats" / "Next Week's Reheats" in the
  // nav bar on every page, so clients know exactly which dates each
  // page covers. Update just the text in quotes below each week —
  // never change the part before the colon. Leave blank ("") to show
  // just the plain label with no dates.
  THIS_WEEK_DATES: "Sept 20–26",
  NEXT_WEEK_DATES: "Sept 29–Oct 3"
};
