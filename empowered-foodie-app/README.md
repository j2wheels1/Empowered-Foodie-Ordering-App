# Empowered Foodie — Weekly Menu & Ordering App

A simple website where clients can see this week's menu, flag allergies and
preferences, and submit an order request with special notes. It does **not**
collect payment — that stays part of your existing process.

No backend server, no database, no monthly hosting cost. It runs as free
static files on GitHub Pages, reads the menu from a Google Sheet you edit,
and saves order requests into another Google Sheet.

---

## What you'll set up (one time, ~20–30 minutes total)

1. Put this code on GitHub and turn on GitHub Pages (makes the site live)
2. A Google Sheet for the weekly menu, published as a live CSV feed
3. A tiny free Google Apps Script that saves order requests into a Sheet
4. Swap in your real logo

After that, your **weekly** routine is just: edit the menu Sheet. Nothing
else to touch.

---

## 1. Put this on GitHub and turn on GitHub Pages

1. Go to [github.com](https://github.com) and log in (or create a free account).
2. Click **New repository**. Name it something like `empowered-foodie-app`. Keep it Public (required for free GitHub Pages). Click **Create repository**.
3. On the new repo page, click **uploading an existing file** and drag in every file/folder from this project (`index.html`, the `assets` folder, the `apps-script` folder, this `README.md`).
4. Click **Commit changes**.
5. In the repo, go to **Settings > Pages**.
6. Under "Build and deployment," set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`. Click **Save**.
7. Wait about a minute, then refresh — GitHub gives you a live URL like `https://yourusername.github.io/empowered-foodie-app/`. That's your site.

You don't need git installed on your computer — the "uploading an existing
file" button works entirely in the browser, and so does editing files later
(open any file in GitHub, click the pencil icon to edit, commit changes).

---

## 2. Set up the weekly menu Google Sheet

1. Create a new Google Sheet. Name it something like "Empowered Foodie — Weekly Menu."
2. In row 1, add these exact column headers:

   | Category | Item | Description | Allergens |
   |----------|------|--------------|-----------|

   - **Category** — e.g. `Breakfast & Baked Goods`, `Soups`, `Main Dishes` — items are grouped and displayed by category on the site
   - **Item** — dish name
   - **Description** — short description (optional)
   - **Allergens** — comma-separated, e.g. `Dairy, Gluten` (optional)

3. Fill in a few rows for this week's menu. A ready-made example — `sample-menu.csv` in this project, built from a real week's dishes — has rows in the exact format expected; open it and paste the rows straight into your Sheet to see the app populated with real content immediately.
4. Go to **File > Share > Publish to web**.
5. Choose the specific sheet/tab, set format to **Comma-separated values (.csv)**, click **Publish**.
6. Copy the URL it gives you.
7. In your GitHub repo, open `assets/config.js`, click the pencil to edit, and paste that URL as the value of `MENU_CSV_URL`. Commit changes.

**Your weekly update from now on:** open this Sheet, edit the rows, done.
The website reads the sheet live — no redeploy needed.

---

## 3. Set up order requests (Google Apps Script)

1. Create a new Google Sheet for orders (or a new tab in your existing one). Name the tab exactly **Orders**.
2. In row 1, add these headers:

   `Timestamp | Name | Email | Phone | Items | Allergies | Preferences | Notes`

3. In that Sheet, go to **Extensions > Apps Script**.
4. Delete any starter code in the editor, then paste in the contents of `apps-script/Code.gs` from this project.
5. Click **Deploy > New deployment**.
6. Click the gear icon next to "Select type" and choose **Web app**.
7. Set **Execute as** to `Me`, and **Who has access** to `Anyone`. Click **Deploy**.
8. Authorize it with your Google account when prompted (you'll see a warning screen since it's your own unpublished script — click "Advanced" then "Go to project (unsafe)" to proceed; this is expected for personal scripts).
9. Copy the **Web app URL** it gives you.
10. In `assets/config.js`, paste that URL as the value of `ORDERS_ENDPOINT_URL`. Commit changes.

Now every order request submitted on the site appears as a new row in your
Orders sheet, ready to cross-reference against your Client Cheat Sheet the
way you already do for production sheets.

---

## 4. Logo

Your real logo (`assets/logo.png`) is already wired in — the header, browser
tab icon area, and README all reference it. If you ever swap in a new
version, just re-upload a file named `logo.png` into the `assets` folder in
GitHub (overwrite the existing one), or upload under a different name and
update this line near the top of `index.html`:

```html
<img class="logo" src="assets/logo.png" alt="Empowered Foodie">
```

---

## Notes

- **No payment or billing** happens anywhere in this app, by design. The order form is a request only; the confirmation message tells clients you'll follow up separately.
- **Allergies vs. preferences** are separate fields on the order form so allergy flags stand out clearly for the kitchen (matches the red-alert convention on your production sheets).
- If you ever want item photos, pricing display (still no checkout), or a login-based client history, those are natural next additions to `index.html` / `assets/app.js` — the structure is built to extend.
