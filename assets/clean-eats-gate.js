/* Empowered Foodie — Clean Eats reheat pages gate
   Asks for an email, checks it against Client Contacts (same lookup
   the order gate uses), and only reveals the reheat instructions to
   clients whose Menu Group is Clean Eats or Both. The email and tag are
   remembered on this device so the gate doesn't repeat. Note: this
   hides the page from the wrong clients, but it isn't true security —
   anyone with the exact file link could still open it. */

(function () {
  const cfg = window.EF_CONFIG || {};
  const gate = document.getElementById("clean-gate");
  const content = document.getElementById("clean-reheats-content");
  const input = document.getElementById("gate-email");
  const btn = document.getElementById("gate-continue-btn");
  const statusEl = document.getElementById("gate-status");

  function hasCleanEats(group) {
    const g = String(group || "").toLowerCase();
    return g.includes("clean") || g.includes("both");
  }

  function remember(email, group) {
    try {
      localStorage.setItem("ef_email", email);
      localStorage.setItem("ef_menu_group", group || "");
    } catch (e) { /* storage unavailable — gate just asks again next time */ }
  }

  function unlock() {
    gate.style.display = "none";
    content.style.display = "block";
    if (window.EF_injectCleanEatsNav) window.EF_injectCleanEatsNav();
    if (window.EF_loadReheats) window.EF_loadReheats();
  }

  function showMessage(cls, msg) {
    statusEl.className = cls;
    statusEl.textContent = msg;
  }

  function resetButton() {
    btn.disabled = false;
    btn.textContent = "Continue";
  }

  function check(email, silent) {
    if (!email) {
      if (!silent) showMessage("error", "Please enter your email first.");
      return;
    }
    if (!cfg.ORDERS_ENDPOINT_URL || cfg.ORDERS_ENDPOINT_URL.indexOf("PASTE_YOUR") === 0) {
      if (!silent) showMessage("error", "Order system isn't connected yet — see README.md.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Checking…";

    const url = `${cfg.ORDERS_ENDPOINT_URL}?action=checkClient&email=${encodeURIComponent(email)}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.exists) remember(email, data.menuGroup || "");
        if (data.exists && hasCleanEats(data.menuGroup)) {
          unlock();
        } else {
          resetButton();
          if (!silent) {
            showMessage("error", "These reheat instructions are for Clean Eats clients. If you think you should have access, please contact us.");
          }
        }
      })
      .catch(() => {
        resetButton();
        if (!silent) showMessage("error", "Couldn't check that right now. Please try again.");
      });
  }

  btn.addEventListener("click", () => check(input.value.trim(), false));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      check(input.value.trim(), false);
    }
  });

  // If this device already knows their email, check it automatically.
  try {
    const saved = localStorage.getItem("ef_email");
    if (saved) {
      input.value = saved;
      check(saved, true);
    }
  } catch (e) { /* ignore */ }
})();
