/* Empowered Foodie — app logic
   - Loads the weekly menu from a published Google Sheet CSV: Standard,
     Clean Eats, or BOTH, based on the client's Menu Group tag
   - Renders it grouped by category in an item picker on the order form
   - Submits order requests to a Google Apps Script endpoint
   No payment or billing logic lives anywhere in this file. */

(function () {
  // Require arriving via the start-order.html gate: if there's no
  // ?email=... in the URL, this page was reached directly (a
  // bookmark, a saved link, or just typing the URL) rather than
  // through the intended flow, so send them to the gate instead of
  // letting them skip straight to ordering.
  const urlEmail = new URLSearchParams(window.location.search).get("email");
  if (!urlEmail) {
    window.location.href = "start-order.html";
    return;
  }

  const cfg = window.EF_CONFIG || {};

  document.getElementById("year").textContent = new Date().getFullYear();
  if (cfg.CONTACT_EMAIL) {
    const link = document.getElementById("footer-email");
    link.textContent = cfg.CONTACT_EMAIL;
    link.href = "mailto:" + cfg.CONTACT_EMAIL;
  }

  // ---------- Which menu(s) this client sees ----------
  // Carried over in the URL by start-order.html, from the client's
  // Client Contacts "Menu Group" tag. Matched loosely, case-insensitive:
  //   contains "both"                  -> both menus
  //   contains "clean" AND "standard"  -> both menus
  //   contains "clean"                 -> Clean Eats only
  //   anything else / blank            -> Standard only
  const menuGroupParam = (new URLSearchParams(window.location.search).get("menu") || "").toLowerCase();
  let menuMode = "standard";
  if (menuGroupParam.includes("both") || (menuGroupParam.includes("clean") && menuGroupParam.includes("standard"))) {
    menuMode = "both";
  } else if (menuGroupParam.includes("clean")) {
    menuMode = "clean";
  }

  // Remember this client's email and menu tag on this device, so the
  // Clean Eats reheat links show up in the nav (and stay on the other
  // pages). Done here too, not just at sign-in, so it works no matter
  // how the client reached the order form.
  try {
    localStorage.setItem("ef_email", urlEmail);
    localStorage.setItem("ef_menu_group", menuGroupParam);
  } catch (e) { /* storage unavailable — no harm */ }
  if (window.EF_injectCleanEatsNav) window.EF_injectCleanEatsNav();
  function isConfigured(url) {
    return !!url && url.indexOf("PASTE_") !== 0;
  }

  // The list of menus to load for this client. If Clean Eats is
  // selected but its link isn't set up yet, falls back to Standard
  // rather than showing nothing.
  function menuSources() {
    const standard = { key: "standard", label: "Standard Menu", url: cfg.MENU_CSV_URL };
    const clean = { key: "cleaneats", label: "Clean Eats Menu", url: cfg.MENU_CSV_URL_CLEAN_EATS };
    if (menuMode === "both") return [standard, clean].filter((s) => isConfigured(s.url));
    if (menuMode === "clean" && isConfigured(clean.url)) return [clean];
    return [standard].filter((s) => isConfigured(s.url));
  }

  // Updates the "This Week's Menu" heading so there's no ambiguity
  // about which menu(s) someone is looking at.
  function updateMenuSectionLabel() {
    const label = document.getElementById("menu-section-label");
    if (!label) return;
    if (menuMode === "both") label.textContent = "This Week's Menus";
    else if (menuMode === "clean") label.textContent = "This Week's Clean Eats Menu";
  }

  // ---------- Flexible column mapping ----------
  // Looks for headers containing these keywords, so small naming
  // differences in the sheet (e.g. "Item" vs "Item Name") still work.
  function findKey(headers, ...keywords) {
    return headers.find((h) =>
      keywords.some((k) => h.toLowerCase().replace(/\s+/g, "").includes(k))
    );
  }

  function normalizeRows(rows) {
    if (!rows.length) return [];
    const headers = Object.keys(rows[0]);
    const map = {
      category: findKey(headers, "categ", "course", "section", "meal"),
      item: findKey(headers, "item", "dish", "name"),
      description: findKey(headers, "desc"),
      allergens: findKey(headers, "allerg", "contains"),
    };

    return rows
      .map((r) => ({
        category: (map.category ? r[map.category] : "").trim() || "Menu",
        item: (map.item ? r[map.item] : "").trim(),
        description: (map.description ? r[map.description] : "").trim(),
        allergens: (map.allergens ? r[map.allergens] : "")
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      }))
      .filter((r) => r.item);
  }

  function groupByCategory(items) {
    const byCat = {};
    items.forEach((item) => {
      if (!byCat[item.category]) byCat[item.category] = [];
      byCat[item.category].push(item);
    });
    return byCat;
  }

  // Categories where a serving count doesn't apply — clients just check
  // the item off (e.g. a batch of muffins or a tub of hummus, not a
  // per-person serving).
  const NO_SERVINGS_CATEGORIES = ["breakfast", "baked goods", "dip",
