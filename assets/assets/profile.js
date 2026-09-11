/* Empowered Foodie — My Foodie Profile page
   Lets a client look up their own questionnaire answers by email at
   any time (not just their first order) and update them. Pre-fills
   the form with whatever's already on file, or shows it blank for
   someone who's never filled it out. Saving reuses the exact same
   submitQuestionnaire backend action as the first-time questionnaire,
   so it updates Client Contacts and Client Profiles the same way. */

(function () {
  const cfg = window.EF_CONFIG || {};
  document.getElementById("year").textContent = new Date().getFullYear();
  if (cfg.CONTACT_EMAIL) {
    const link = document.getElementById("footer-email");
    link.textContent = cfg.CONTACT_EMAIL;
    link.href = "mailto:" + cfg.CONTACT_EMAIL;
  }

  let currentEmail = "";

  function showForm(profile, isNew) {
    document.getElementById("profile-email-gate").style.display = "none";
    document.getElementById("profile-form-section").style.display = "block";

    document.getElementById("profile-form-heading").textContent = isNew
      ? "Welcome! Let's Build Your Profile"
      : "My Foodie Profile";
    document.getElementById("profile-form-sub").textContent = isNew
      ? "We don't have anything on file for this email yet — fill this out whenever you're ready."
      : "Update anything below — we'll keep your latest answers on file.";

    document.getElementById("p-name").value = profile.name || "";
    document.getElementById("p-cuisine").value = profile.cuisine || "";
    document.getElementById("p-spice").value = profile.spiceLevel || "Mild";
    document.getElementById("p-likes").value = profile.likes || "";
    document.getElementById("p-dislikes").value = profile.dislikes || "";
    document.getElementById("p-allergies").value = profile.allergies || "";
  }

  function loadProfile() {
    const emailInput = document.getElementById("p-email");
    const statusEl = document.getElementById("profile-gate-status");
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

    currentEmail = email;
    const btn = document.getElementById("profile-load-btn");
    btn.disabled = true;
    btn.textContent = "Loading…";

    const url = `${cfg.ORDERS_ENDPOINT_URL}?action=getQuestionnaire&email=${encodeURIComponent(email)}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        showForm(data.profile || {}, !data.found);
      })
      .catch(() => {
        statusEl.className = "error";
        statusEl.textContent = "Couldn't load your profile right now. Please try again.";
        btn.disabled = false;
        btn.textContent = "Load My Profile";
      });
  }

  function saveProfile(e) {
    e.preventDefault();
    const statusEl = document.getElementById("profile-form-status");
    const name = document.getElementById("p-name").value.trim();

    if (!name) {
      statusEl.className = "error";
      statusEl.textContent = "Please add your name.";
      return;
    }

    const fields = {
      action: "submitQuestionnaire",
      name: name,
      email: currentEmail,
      cuisine: document.getElementById("p-cuisine").value.trim(),
      spiceLevel: document.getElementById("p-spice").value,
      likes: document.getElementById("p-likes").value.trim(),
      dislikes: document.getElementById("p-dislikes").value.trim(),
      allergies: document.getElementById("p-allergies").value.trim(),
    };

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Saving…";

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
      statusEl.textContent = "Saved! Your profile is up to date.";
      btn.disabled = false;
      btn.textContent = "Save My Profile";
    }, 800);
  }

  document.getElementById("profile-load-btn").addEventListener("click", loadProfile);
  document.getElementById("profile-form").addEventListener("submit", saveProfile);
})();
