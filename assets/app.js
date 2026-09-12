/* Empowered Foodie — app logic
   - Loads the weekly menu from a published Google Sheet CSV
   - Renders it as a menu board, grouped by category under one heading
   - Builds a matching item picker on the order form
   - Submits order requests to a Google Apps Script endpoint
   No payment or billing logic lives anywhere in this file. */

(function () {
  // Require arriving via the start-order.html gate: if there's no
  // ?email=... in the URL, this page was reached directly (a
  // bookmark, a saved link, or just typing the URL) rather than
  // through the intended flow, so send them to the gate instead of
  // letting them skip straight to ordering. Note: this checks that an
  // email was PASSED ALONG by the gate, not that it's necessarily a
  // verified/known one — closing that fully would need a slower
  // server round-trip on every page load, which risks bouncing a
  // brand-new client back right after they've just finished the
  // questionnaire. This closes the common case (direct navigation)
  // without that trade-off.
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

  function categoryNeedsServings(category) {
    const lower = category.toLowerCase();
    return !NO_SERVINGS_CATEGORIES.some((kw) => lower.includes(kw));
  }

  // Short note on how a category is sold, shown next to its heading.
  function categoryOrderNote(category) {
    const lower = category.toLowerCase();
    if (lower.includes("breakfast") || lower.includes("baked goods")) return "Sold by the dozen";
    if (lower.includes("dip") || lower.includes("soup")) return "Sold by the batch";
    return "";
  }

  // ---------- Rendering: item picker on order form (same category grouping) ----------
  function renderItemPicker(items) {
    const picker = document.getElementById("item-picker");
    picker.innerHTML = "";

    if (!items.length) {
      picker.innerHTML = '<p class="hint">Menu items will appear here once this week\'s menu is published.</p>';
      return;
    }

    const byCat = groupByCategory(items);
    Object.keys(byCat).forEach((cat) => {
      const needsServings = categoryNeedsServings(cat);
      const orderNote = categoryOrderNote(cat);
      const catEl = document.createElement("div");
      catEl.className = "item-picker-category";
      catEl.innerHTML = `<h4>${escapeHtml(cat)}${orderNote ? ` <span class="category-note">${escapeHtml(orderNote)}</span>` : ""}</h4>`;

      byCat[cat].forEach((item, idx) => {
        const checkId = `chk-${cat}-${idx}`.replace(/\s+/g, "-");
        const servingsId = `srv-${cat}-${idx}`.replace(/\s+/g, "-");
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

      const catNoteId = `notes-${cat}`.replace(/\s+/g, "-");
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
  function loadMenu() {
    const picker = document.getElementById("item-picker");
    if (!cfg.MENU_CSV_URL || cfg.MENU_CSV_URL.indexOf("PASTE_YOUR") === 0) {
      picker.innerHTML = '<p class="hint">Menu sheet isn\'t connected yet — see README.md to set MENU_CSV_URL.</p>';
      return;
    }
    picker.innerHTML = '<p class="hint">Loading this week\'s menu…</p>';
    Papa.parse(cfg.MENU_CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const items = normalizeRows(results.data);
        renderItemPicker(items);
      },
      error: () => {
        picker.innerHTML = '<p class="hint">Couldn\'t load the menu right now. Double-check MENU_CSV_URL in config.js.</p>';
      },
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
  // returning client only ever has to type their email once — the
  // rest of the order form fills itself in from what's already on
  // file. A brand-new client still needs to type name and phone once
  // during their first real order, since we don't have those yet.
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
  loadMenu();
})();
