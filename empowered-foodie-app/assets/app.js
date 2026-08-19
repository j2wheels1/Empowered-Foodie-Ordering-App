/* Empowered Foodie — app logic
   - Loads the weekly menu from a published Google Sheet CSV
   - Renders it as a menu board, grouped by category under one heading
   - Builds a matching item picker on the order form
   - Submits order requests to a Google Apps Script endpoint
   No payment or billing logic lives anywhere in this file. */

(function () {
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

  // ---------- Rendering: menu board (one heading, categories below it) ----------
  function renderMenuBoard(items) {
    const board = document.getElementById("menu-board");
    const status = document.getElementById("menu-status");
    board.innerHTML = "";

    if (!items.length) {
      status.textContent = "No menu items are published yet — check back soon.";
      return;
    }

    status.textContent = "Updated live from this week's menu sheet.";

    const byCat = groupByCategory(items);
    Object.keys(byCat).forEach((cat) => {
      const catItems = byCat[cat];
      const catBlock = document.createElement("div");
      catBlock.className = "menu-category-block";

      const catHeading = document.createElement("div");
      catHeading.className = "menu-category-heading";
      catHeading.innerHTML = `<h3>${escapeHtml(cat)}</h3><span class="count">${catItems.length} item${catItems.length === 1 ? "" : "s"}</span>`;
      catBlock.appendChild(catHeading);

      catItems.forEach((item) => {
        const row = document.createElement("div");
        row.className = "menu-item";
        const tags = item.allergens
          .map((a) => `<span class="tag tag-allergen">${escapeHtml(a)}</span>`)
          .join("");
        row.innerHTML = `
          <div>
            <div class="menu-item-name">${escapeHtml(item.item)}</div>
            ${item.description ? `<div class="menu-item-desc">${escapeHtml(item.description)}</div>` : ""}
            ${tags ? `<div class="tag-row">${tags}</div>` : ""}
          </div>
        `;
        catBlock.appendChild(row);
      });

      board.appendChild(catBlock);
    });
  }

  // Categories where a serving count doesn't apply — clients just check
  // the item off (e.g. a batch of muffins or a tub of hummus, not a
  // per-person serving).
  const NO_SERVINGS_CATEGORIES = ["breakfast", "baked goods", "dip"];

  function categoryNeedsServings(category) {
    const lower = category.toLowerCase();
    return !NO_SERVINGS_CATEGORIES.some((kw) => lower.includes(kw));
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
      const catEl = document.createElement("div");
      catEl.className = "item-picker-category";
      catEl.innerHTML = `<h4>${escapeHtml(cat)}</h4>`;

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
    const status = document.getElementById("menu-status");
    if (!cfg.MENU_CSV_URL || cfg.MENU_CSV_URL.indexOf("PASTE_YOUR") === 0) {
      status.textContent = "Menu sheet isn't connected yet — see README.md to set MENU_CSV_URL.";
      return;
    }
    Papa.parse(cfg.MENU_CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const items = normalizeRows(results.data);
        renderMenuBoard(items);
        renderItemPicker(items);
      },
      error: () => {
        status.textContent = "Couldn't load the menu right now. Double-check MENU_CSV_URL in config.js.";
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

  function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const statusEl = document.getElementById("order-status");

    if (!form.name.value.trim() || !form.email.value.trim()) {
      statusEl.className = "error";
      statusEl.textContent = "Please add your name and email before submitting.";
      return;
    }

    const allergiesOther = document.getElementById("f-allergies-other").value.trim();
    let allergies = collectChecked("allergies");
    if (allergiesOther) allergies = allergies ? `${allergies}, ${allergiesOther}` : allergiesOther;

    const payload = new FormData();
    payload.append("name", form.name.value.trim());
    payload.append("email", form.email.value.trim());
    payload.append("phone", form.phone.value.trim());
    payload.append("items", collectSelectedItems());
    payload.append("allergies", allergies);
    payload.append("preferences", collectChecked("preferences"));
    payload.append("notes", form.notes.value.trim());

    if (!cfg.ORDERS_ENDPOINT_URL || cfg.ORDERS_ENDPOINT_URL.indexOf("PASTE_YOUR") === 0) {
      statusEl.className = "error";
      statusEl.textContent = "Order inbox isn't connected yet — see README.md to set ORDERS_ENDPOINT_URL.";
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    // Apps Script + no-cors: we can't read the response, so we treat
    // a completed fetch as success. Errors (network down, wrong URL)
    // still surface via .catch().
    fetch(cfg.ORDERS_ENDPOINT_URL, { method: "POST", mode: "no-cors", body: payload })
      .then(() => {
        statusEl.className = "success";
        statusEl.textContent = "Thanks! Your order request has been received. We'll follow up to confirm details — no payment was collected here.";
        form.reset();
      })
      .catch(() => {
        statusEl.className = "error";
        statusEl.textContent = "Something went wrong sending your request. Please try again or email us directly.";
      })
      .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Order Request";
      });
  }

  document.getElementById("order-form").addEventListener("submit", handleSubmit);
  loadMenu();
})();
