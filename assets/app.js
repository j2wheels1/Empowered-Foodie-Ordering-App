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
  const NO_SERVINGS_CATEGORIES = ["breakfast", "baked goods", "dip", "soup"];

  // Specific items that need a servings count even though their
  // category normally doesn't — e.g. Overnight Oats is ordered by the
  // serving despite living in Breakfast & Baked Goods. Matched
  // case-insensitively against the item name.
  const ITEM_SERVINGS_OVERRIDES = ["overnight oats"];

  function itemNeedsServings(category, itemName) {
    const lowerItem = itemName.toLowerCase();
    if (ITEM_SERVINGS_OVERRIDES.some((name) => lowerItem.includes(name))) return true;
    const lowerCat = category.toLowerCase();
    return !NO_SERVINGS_CATEGORIES.some((kw) => lowerCat.includes(kw));
  }

  // Short note on how a category is sold, shown next to its heading.
  function categoryOrderNote(category) {
    const lower = category.toLowerCase();
    if (lower.includes("breakfast") || lower.includes("baked goods")) return "Sold by the dozen";
    if (lower.includes("dip") || lower.includes("soup")) return "Sold by the batch";
    return "";
  }

  function safeId(str) {
    return String(str).replace(/[^A-Za-z0-9_-]+/g, "-");
  }

  // ---------- Rendering: item picker on order form ----------
  // `sections` is a list of { key, label, items, failed }. When more
  // than one menu is showing, each gets its own heading; ids include
  // the menu key so the same category name in both menus can't collide.
  function renderItemPicker(sections) {
    const picker = document.getElementById("item-picker");
    picker.innerHTML = "";

    const showHeadings = sections.length > 1;
    const anyItems = sections.some((s) => s.items && s.items.length);

    if (!anyItems) {
      picker.innerHTML = '<p class="hint">Menu items will appear here once this week\'s menu is published.</p>';
      return;
    }

    sections.forEach((section) => {
      if (showHeadings) {
        const heading = document.createElement("h3");
        heading.className = "menu-section-heading";
        heading.style.margin = "28px 0 8px";
        heading.textContent = section.label;
        picker.appendChild(heading);
      }

      if (section.failed) {
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent = `Couldn't load the ${section.label} right now. Please refresh to try again.`;
        picker.appendChild(p);
        return;
      }

      if (!section.items.length) {
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent = `The ${section.label} will appear here once it's published.`;
        picker.appendChild(p);
        return;
      }

      const byCat = groupByCategory(section.items);
      Object.keys(byCat).forEach((cat) => {
        const orderNote = categoryOrderNote(cat);
        const catEl = document.createElement("div");
        catEl.className = "item-picker-category";
        catEl.innerHTML = `<h4>${escapeHtml(cat)}${orderNote ? ` <span class="category-note">${escapeHtml(orderNote)}</span>` : ""}</h4>`;

        byCat[cat].forEach((item, idx) => {
          const needsServings = itemNeedsServings(cat, item.item);
          const checkId = safeId(`chk-${section.key}-${cat}-${idx}`);
          const servingsId = safeId(`srv-${section.key}-${cat}-${idx}`);
          const row = document.createElement("div");
          row.className = "item-row";
          row.innerHTML = `
            <label class="item-select" for="${checkId}">
              <input type="checkbox" id="${checkId}" class="item-check"
                     data-category="${escapeAttr(cat)}" data-item="${escapeAttr(item.item)}"
                     ${needsServings ? `data-servings-id="${servingsId}"` : ""}>
              <span>${escapeHtml(item.item)}${item.description ? ` — <span class="hint" style="display:inline">${escapeHtml(item.description)}</span>` : ""}</span>
            </label>
            ${needsServings ? `
            <span class="servings-field">
              <label class="servings-label" for="${servingsId}">Servings</label>
              <input type="number" min="1" max="20" step="1" id="${servingsId}" class="item-servings" disabled>
            </span>` : ""}
          `;
          catEl.appendChild(row);
        });

        const catNoteId = safeId(`notes-${section.key}-${cat}`);
        const noteRow = document.createElement("div");
        noteRow.className = "category-notes-row";
        noteRow.innerHTML = `
          <label class="category-notes-label" for="${catNoteId}">Notes for ${escapeHtml(cat)} <span class="hint" style="display:inline">(optional)</span></label>
          <input type="text" id="${catNoteId}" class="category-notes-input" data-category="${escapeAttr(cat)}"
                 placeholder="e.g. extra spicy, no cilantro">
        `;
        catEl.appendChild(noteRow);

        picker.appendChild(catEl);
      });
    });
  }

  // Enable/disable the paired servings field as its checkbox is toggled.
  document.getElementById("item-picker").addEventListener("change", (e) => {
    if (!e.target.classList.contains("item-check")) return;
    const servingsId = e.target.dataset.servingsId;
    if (!servingsId) return;
    const servingsInput = document.getElementById(servingsId);
    if (!servingsInput) return;
    servingsInput.disabled = !e.target.checked;
    if (e.target.checked) {
      if (!servingsInput.value) servingsInput.value = "1";
    } else {
      servingsInput.value = "";
    }
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  // ---------- Load menu ----------
  function parseMenu(url) {
    return new Promise((resolve, reject) => {
      Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(normalizeRows(results.data)),
        error: (err) => reject(err),
      });
    });
  }

  function loadMenu() {
    const picker = document.getElementById("item-picker");
    const sources = menuSources();
    if (!sources.length) {
      picker.innerHTML = '<p class="hint">Menu sheet isn\'t connected yet — see README.md to set MENU_CSV_URL.</p>';
      return;
    }
    picker.innerHTML = '<p class="hint">Loading this week\'s menu…</p>';

    Promise.allSettled(sources.map((s) => parseMenu(s.url))).then((results) => {
      const sections = sources.map((s, i) => ({
        key: s.key,
        label: s.label,
        items: results[i].status === "fulfilled" ? results[i].value : [],
        failed: results[i].status === "rejected",
      }));

      if (sections.every((s) => s.failed)) {
        picker.innerHTML = '<p class="hint">Couldn\'t load the menu right now. Double-check MENU_CSV_URL in config.js.</p>';
        return;
      }
      renderItemPicker(sections);
    });
  }

  // ---------- Order submission ----------
  function collectSelectedItems() {
    const checks = document.querySelectorAll(".item-check:checked");
    const selected = [];
    checks.forEach((chk) => {
      const item = chk.dataset.item;
      const category = chk.dataset.category;
      const servingsId = chk.dataset.servingsId;
      if (servingsId) {
        const servingsInput = document.getElementById(servingsId);
        const servings = servingsInput ? servingsInput.value.trim() : "";
        selected.push(`${item} (${category})${servings ? ` — ${servings} servings` : ""}`);
      } else {
        selected.push(`${item} (${category})`);
      }
    });
    return selected.join("; ");
  }

  function collectChecked(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
      .map((el) => el.value)
      .join(", ");
  }

  function collectCategoryNotes() {
    const inputs = document.querySelectorAll(".category-notes-input");
    const parts = [];
    inputs.forEach((input) => {
      const val = input.value.trim();
      if (val) parts.push(`${input.dataset.category}: ${val}`);
    });
    return parts.join(" | ");
  }

  function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const statusEl = document.getElementById("order-status");

    if (!form.name.value.trim() || !form.email.value.trim() || !form.phone.value.trim()) {
      statusEl.className = "error";
      statusEl.textContent = "Please add your name, email, and phone number before submitting.";
      return;
    }

    const allergiesOther = document.getElementById("f-allergies-other").value.trim();
    let allergies = collectChecked("allergies");
    if (allergiesOther) allergies = allergies ? `${allergies}, ${allergiesOther}` : allergiesOther;

    const categoryNotes = collectCategoryNotes();
    const generalNotes = form.notes.value.trim();
    const combinedNotes = [categoryNotes, generalNotes].filter(Boolean).join(" | ");

    const fields = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      items: collectSelectedItems(),
      allergies: allergies,
      preferences: collectChecked("preferences"),
      notes: combinedNotes,
    };

    if (!cfg.ORDERS_ENDPOINT_URL || cfg.ORDERS_ENDPOINT_URL.indexOf("PASTE_YOUR") === 0) {
      statusEl.className = "error";
      statusEl.textContent = "Order inbox isn't connected yet — see README.md to set ORDERS_ENDPOINT_URL.";
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    submitViaHiddenForm(cfg.ORDERS_ENDPOINT_URL, fields);

    // Submitting into a hidden cross-origin iframe means we can't read
    // back whether Apps Script succeeded, so we confirm optimistically
    // once the browser has had a moment to dispatch it. This is the
    // standard, most reliable way to post form data into an Apps
    // Script Web App from a static site.
    setTimeout(() => {
      statusEl.className = "success";
      statusEl.textContent = "Thanks! Your order request has been received. Payment is collected at time of delivery.";
      form.reset();
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Order Request";
    }, 800);
  }

  function submitViaHiddenForm(url, fields) {
    let iframe = document.getElementById("ef-hidden-submit-frame");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "ef-hidden-submit-frame";
      iframe.name = "ef-hidden-submit-frame";
      iframe.style.display = "none";
      document.body.appendChild(iframe);
    }

    const tempForm = document.createElement("form");
    tempForm.action = url;
    tempForm.method = "POST";
    tempForm.target = "ef-hidden-submit-frame";
    tempForm.style.display = "none";

    Object.keys(fields).forEach((key) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = fields[key];
      tempForm.appendChild(input);
    });

    document.body.appendChild(tempForm);
    tempForm.submit();
    document.body.removeChild(tempForm);
  }

  // Pre-fills name, email, and phone if they arrived via the URL (set
  // by start-order.html after checking/collecting them there), so a
  // returning client only ever has to type their email once.
  function prefillFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email");
    const name = params.get("name");
    const phone = params.get("phone");
    if (email) document.getElementById("f-email").value = email;
    if (name) document.getElementById("f-name").value = name;
    if (phone) document.getElementById("f-phone").value = phone;
  }

  document.getElementById("order-form").addEventListener("submit", handleSubmit);
  prefillFromUrl();
  updateMenuSectionLabel();
  loadMenu();
})();
