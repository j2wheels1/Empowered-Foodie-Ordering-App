/* Empowered Foodie — order history page
   - If the URL has ?token=..., fetches and displays that client's past
     orders from the Apps Script backend.
   - Otherwise shows a form to request a one-time email link.
   No accounts or passwords anywhere in this flow. */

(function () {
  const cfg = window.EF_CONFIG || {};

  document.getElementById("year").textContent = new Date().getFullYear();
  if (cfg.CONTACT_EMAIL) {
    const link = document.getElementById("footer-email");
    link.textContent = cfg.CONTACT_EMAIL;
    link.href = "mailto:" + cfg.CONTACT_EMAIL;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Same "Item (Category) — N servings" format the order form sends,
  // parsed and grouped by category for a clean, readable display.
  function groupItems(itemsString) {
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

  function formatDate(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    if (isNaN(d)) return "";
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function renderOrderCard(order) {
    const card = document.createElement("div");
    card.className = "history-order-card";

    let html = `<div class="history-order-date">${escapeHtml(formatDate(order.timestamp))}</div>`;

    const byCategory = groupItems(order.items);
    const categories = Object.keys(byCategory);
    if (categories.length) {
      categories.forEach((cat) => {
        html += `<p class="history-item-category">${escapeHtml(cat)}</p>`;
        html += '<ul class="history-item-list">';
        byCategory[cat].forEach((item) => {
          const prefix = item.servings ? `(${item.servings} servings) ` : "";
          html += `<li>${prefix}${escapeHtml(item.name)}</li>`;
        });
        html += "</ul>";
      });
    }

    if (order.allergies) {
      html += `<p class="history-detail-label history-detail-alert">Allergies</p><p class="history-detail-value history-detail-alert">${escapeHtml(order.allergies)}</p>`;
    }
    if (order.preferences) {
      html += `<p class="history-detail-label">Dietary Preferences</p><p class="history-detail-value">${escapeHtml(order.preferences)}</p>`;
    }
    if (order.notes) {
      html += `<p class="history-detail-label">Notes</p><p class="history-detail-value">${escapeHtml(order.notes)}</p>`;
    }

    card.innerHTML = html;
    return card;
  }

  function renderHistory(orders) {
    const results = document.getElementById("history-results");
    results.style.display = "block";
    results.innerHTML = "";

    if (!orders.length) {
      results.innerHTML = '<p class="hint">No past orders found for this email yet.</p>';
      return;
    }

    orders.forEach((order) => {
      results.appendChild(renderOrderCard(order));
    });
  }

  function loadHistoryFromToken(token) {
    document.getElementById("history-request").style.display = "none";
    const results = document.getElementById("history-results");
    results.style.display = "block";
    results.innerHTML = '<p class="hint">Loading your order history…</p>';

    if (!cfg.ORDERS_ENDPOINT_URL || cfg.ORDERS_ENDPOINT_URL.indexOf("PASTE_YOUR") === 0) {
      results.innerHTML = '<p class="hint">Order history isn\'t connected yet — see README.md.</p>';
      return;
    }

    const url = `${cfg.ORDERS_ENDPOINT_URL}?action=getHistory&token=${encodeURIComponent(token)}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          results.innerHTML = `<p class="hint">${escapeHtml(data.error)}</p>`;
          return;
        }
        renderHistory(data.orders || []);
      })
      .catch(() => {
        results.innerHTML = '<p class="hint">Couldn\'t load your order history right now. Try refreshing, or request a new link below.</p>';
        document.getElementById("history-request").style.display = "block";
      });
  }

  function requestHistoryLink() {
    const emailInput = document.getElementById("h-email");
    const statusEl = document.getElementById("request-status");
    const email = emailInput.value.trim();

    if (!email) {
      statusEl.className = "error";
      statusEl.textContent = "Please enter your email first.";
      return;
    }

    if (!cfg.ORDERS_ENDPOINT_URL || cfg.ORDERS_ENDPOINT_URL.indexOf("PASTE_YOUR") === 0) {
      statusEl.className = "error";
      statusEl.textContent = "Order history isn't connected yet — see README.md.";
      return;
    }

    const btn = document.getElementById("request-history-btn");
    btn.disabled = true;
    btn.textContent = "Sending…";

    // Same hidden-iframe technique used by the order form — the most
    // reliable way to POST to Apps Script from a static site.
    let iframe = document.getElementById("ef-hidden-submit-frame");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "ef-hidden-submit-frame";
      iframe.name = "ef-hidden-submit-frame";
      iframe.style.display = "none";
      document.body.appendChild(iframe);
    }

    const form = document.createElement("form");
    form.action = cfg.ORDERS_ENDPOINT_URL;
    form.method = "POST";
    form.target = "ef-hidden-submit-frame";
    form.style.display = "none";

    const actionInput = document.createElement("input");
    actionInput.type = "hidden";
    actionInput.name = "action";
    actionInput.value = "requestHistory";
    form.appendChild(actionInput);

    const emailField = document.createElement("input");
    emailField.type = "hidden";
    emailField.name = "email";
    emailField.value = email;
    form.appendChild(emailField);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    setTimeout(() => {
      statusEl.className = "success";
      statusEl.textContent = "Check your email for a link to view your order history — it's valid for 24 hours.";
      btn.disabled = false;
      btn.textContent = "Email Me My Order History Link";
    }, 800);
  }

  document.getElementById("request-history-btn").addEventListener("click", requestHistoryLink);

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) loadHistoryFromToken(token);
})();
