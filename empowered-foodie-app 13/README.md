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

1. Create a new Google Sheet for orders (or use your existing one). Name the tab exactly **Orders**.
2. In row 1, add these headers:

   `Timestamp | Name | Email | Phone | Items | Allergies | Preferences | Notes`

3. In that **same** Google Sheet, add a **second tab** named exactly **Client Contacts**. In row 1, add:

   `Name | Email | Phone | Last Updated`

   This tab stays private forever — **never share this spreadsheet file with staff.** It's what the script uses behind the scenes to reliably recognize returning clients by email, without exposing that email anywhere staff can see.

4. Add a **third tab**, also in the same sheet, named exactly **History Tokens**. In row 1, add:

   `Token | Email | Created At | Expires At`

   Also private, also never shared. This one powers the "Order History" page on the site — when a client asks to see their past orders, this tab stores a one-time link tied to their email for 24 hours.

5. Now create a **completely separate, second Google Sheet file** — a new file, not another tab. Name it something like "Empowered Foodie — Client Profiles." Add one tab named exactly **Client Profiles**, with row 1 as:

   `Name | Allergies | Preferences | Standing Notes | Last Updated`

   No email or phone column exists here at all. **This is the file you share with your team** — click **Share** (top right) and add each team member's Google account. Because it's a separate file from Orders/Client Contacts, sharing it can never expose anything beyond what's in this one tab.

6. Copy this new sheet's ID from its URL — it's the long string between `/d/` and `/edit`:

   `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

7. Back in your **Orders** sheet, go to **Extensions > Apps Script**.
8. Delete any starter code in the editor, then paste in the contents of `apps-script/Code.gs` from this project.
9. Near the top of the file, find `CLIENT_PROFILES_SPREADSHEET_ID` and paste in the ID you copied in step 6. While you're there, double-check `SITE_URL` matches your actual live site address.
10. **Grant email permission (one time only):** in the toolbar, use the function dropdown (next to the Debug button) to select `testEmailPermission`, then click **Run**. Google will show a permission screen — click "Advanced" then "Go to project (unsafe)", then **Allow**. You should get a test email in your own inbox within a minute or two — that confirms it's working. You only need to do this once, ever.
11. Click **Deploy > New deployment**.
12. Click the gear icon next to "Select type" and choose **Web app**.
13. Set **Execute as** to `Me`, and **Who has access** to `Anyone`. Click **Deploy**.
14. Authorize it with your Google account when prompted (same "Advanced" > "Go to project (unsafe)" step as above — this is expected for personal scripts).
15. Copy the **Web app URL** it gives you.
16. In `assets/config.js`, paste that URL as the value of `ORDERS_ENDPOINT_URL`. Commit changes.

Now every order request submitted on the site appears as a new row in your
Orders sheet, ready to cross-reference against your Client Cheat Sheet the
way you already do for production sheets — and the client who submitted it
gets an automatic confirmation email summarizing what they ordered — and
you get a notification email too, sent automatically to whichever Google
account you used to set this up.

You'll also get a text message on your phone via your carrier's free
email-to-SMS gateway. This uses `CHEF_TEXT_GATEWAY` near the top of
`Code.gs` (currently set to your number @ T-Mobile's gateway). **If you
switch carriers, just update that one line** — the comment above it lists
the gateway domains for Verizon, AT&T, and T-Mobile. To test it on its
own, run the `testTextNotification` function from the Apps Script editor
the same way you'd run `testEmailPermission`.

**On the Client Profiles system:** every order automatically recognizes
returning clients (matched privately by email via the Client Contacts
tab) and updates their row in the separate Client Profiles sheet — new
allergies or preferences are **added** to what's already there, nothing
is ever automatically removed or overwritten, and staff never see a
single email address or phone number anywhere in that file. The
"Standing Notes" column is yours alone to maintain by hand (it's not
touched by any order) — that's where your imported cheat-sheet notes
live, kept separate from the transient, per-order notes that stay in
the Orders tab. To confirm this is set up correctly before relying on
it, run `testClientProfileUpdate` **twice in a row** from the Apps
Script editor — the second run should update the same "Test Client"
row in both sheets rather than creating duplicates.

**On the Order History page:** clients can view their own past orders
at `history.html` without any account or password. They enter their
email, get a one-time link by email (valid 24 hours), and clicking it
shows every order tied to that email, grouped and formatted the same
way as their confirmation emails. Nobody can see another client's
history just by guessing an email — only someone with access to that
inbox can ever open the link. To test the whole flow without waiting
on email, run `testHistoryFlow` from the Apps Script editor — it logs
a link and the order data it would show, so you can confirm both
pieces work before a client tries it for real.

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

## 5. "Install" as an app (for you and your clients)

This site is set up as a Progressive Web App, so anyone visiting it can add
it to their phone's home screen as a real-looking app icon:

- **Android (Chrome):** visiting the site will often show an automatic
  "Install app" banner. If not, tap the three-dot menu > "Add to Home
  screen" / "Install app."
- **iPhone (Safari):** tap the Share icon > "Add to Home Screen." (Apple
  doesn't support an automatic prompt like Android does — this manual step
  is the only way on iOS, for any website.)

Either way, the result is the same: a branded icon that opens full-screen,
no browser address bar, indistinguishable from a "real" app. Worth
mentioning to clients once the site is live.

---

## Notes

- **No payment or billing** happens anywhere in this app, by design. The order form is a request only; the confirmation message tells clients you'll follow up separately.
- **Allergies vs. preferences** are separate fields on the order form so allergy flags stand out clearly for the kitchen (matches the red-alert convention on your production sheets).
- If you ever want item photos, pricing display (still no checkout), or a login-based client history, those are natural next additions to `index.html` / `assets/app.js` — the structure is built to extend.
