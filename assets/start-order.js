/* Empowered Foodie — start-order gate page
   1. Client enters email.
   2. We check it against Client Contacts (read-only GET, same pattern
      as Order History's lookup).
   3. Known email -> straight to the order page.
   4. New email -> show the questionnaire; submitting it saves the
      answers AND creates a Client Contacts entry immediately (so
      they're not asked again even if they don't finish an order right
      away), then continues to the order page. */

(function () {
  const cfg = window.EF_CONFIG || {};
  document.getElementById("year").textContent = new Date().getFullYear();
  if (cfg.CONTACT_EMAIL) {
    const link = document.getElementById("footer-email");
    link.textContent = cfg.CONTACT_EMAIL;
    link.href = "mailto:" + cfg.CONTACT_EMAIL;
  }

  const ORDER_PAGE = "index.html#order";
  let pendingEmail = "";

  function goToOrderPage() {
    window.location.href = ORDER_PAGE;
  }

  function checkClient() {
    const emailInput = document.getElementById("gate-email");
    const statusEl = document.getElementById("gate-status");
    const email = emailInput.value.trim();

    if (!email) {
      statusEl.className = "error";
      statusEl.textContent = "Please enter your email first.";
      return;
    }

    if (!cfg.ORDERS_ENDPOINT_URL || cfg.ORDERS_ENDPOINT_URL.indexOf("PASTE_YOUR") === 0) {
      statusEl.className = "error";
      statusEl.textContent = "Order system isn't connected yet — see README.md.";
      return;
    }

    pendingEmail = email;
    const btn = document.getElementById("gate-continue-btn");
    btn.disabled = true;
    btn.textContent = "Checking…";

    const url = `${cfg.ORDERS_ENDPOINT_URL}?action=checkClient&email=${encodeURIComponent(email)}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.exists) {
          statusEl.className = "success";
          statusEl.textContent = "Welcome back! Taking you to the order page…";
          setTimeout(goToOrderPage, 700);
        } else {
          document.getElementById("email-gate").style.display = "none";
          document.getElementById("questionnaire-section").style.display = "block";
        }
      })
      .catch(() => {
        statusEl.className = "error";
        statusEl.textContent = "Couldn't check that right now. Please try again.";
        btn.disabled = false;
        btn.textContent = "Continue";
      });
  }

  function submitQuestionnaire(e) {
    e.preventDefault();
    const statusEl = document.getElementById("questionnaire-status");
    const name = document.getElementById("q-name").value.trim();

    if (!name) {
      statusEl.className = "error";
      statusEl.textContent = "Please add your name.";
      return;
    }

    const fields = {
      action: "submitQuestionnaire",
      name: name,
      email: pendingEmail,
      cuisine: document.getElementById("q-cuisine").value.trim(),
      spiceLevel: document.getElementById("q-spice").value,
      likes: document.getElementById("q-likes").value.trim(),
      dislikes: document.getElementById("q-dislikes").value.trim(),
      allergies: document.getElementById("q-allergies").value.trim(),
    };

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Saving…";

    // Same hidden-iframe technique used by the order form and the
    // history request form — the reliable way to POST to Apps Script.
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

    Object.keys(fields).forEach((key) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = fields[key];
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    setTimeout(() => {
      statusEl.className = "success";
      statusEl.textContent = "Thanks! Taking you to the order page…";
      setTimeout(goToOrderPage, 700);
    }, 800);
  }

  document.getElementById("gate-continue-btn").addEventListener("click", checkClient);
  document.getElementById("questionnaire-form").addEventListener("submit", submitQuestionnaire);
})();
