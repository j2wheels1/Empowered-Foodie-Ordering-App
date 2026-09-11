/* Empowered Foodie — reheat instructions page
   Reads assets/reheat-instructions.csv directly (a file in this repo,
   NOT a Google Sheet) and renders it grouped by category with a live
   search box. Updated by regenerating that one CSV file whenever a new
   Word doc of reheat instructions comes in — nothing else on this page
   needs to change. */

(function () {
  document.getElementById("year").textContent = new Date().getFullYear();

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function normalizeRows(rows) {
    if (!rows.length) return [];
    const headers = Object.keys(rows[0]);
    const findKey = (...keywords) =>
      headers.find((h) => keywords.some((k) => h.toLowerCase().replace(/\s+/g, "").includes(k)));

    const map = {
      category: findKey("categ", "course", "section"),
      dish: findKey("dish", "item", "name"),
      instructions: findKey("instruct", "reheat", "direction"),
    };

    return rows
      .map((r) => ({
        category: (map.category ? r[map.category] : "").trim() || "Dishes",
        dish: (map.dish ? r[map.dish] : "").trim(),
        instructions: (map.instructions ? r[map.instructions] : "").trim(),
      }))
      .filter((r) => r.dish);
  }

  function groupByCategory(items) {
    const byCat = {};
    items.forEach((item) => {
      if (!byCat[item.category]) byCat[item.category] = [];
      byCat[item.category].push(item);
    });
    return byCat;
  }

  let allDishes = [];

  function renderCard(dish) {
    const card = document.createElement("div");
    card.className = "history-order-card";
    card.innerHTML = `
      <p class="history-item-category" style="margin-top:0;">${escapeHtml(dish.dish)}</p>
      <p class="history-detail-value">${escapeHtml(dish.instructions)}</p>
    `;
    return card;
  }

  function renderList(dishes) {
    const results = document.getElementById("reheats-results");
    results.innerHTML = "";

    if (!dishes.length) {
      results.innerHTML = '<p class="hint">No dishes match your search.</p>';
      return;
    }

    const byCat = groupByCategory(dishes);
    Object.keys(byCat).forEach((cat) => {
      const heading = document.createElement("p");
      heading.className = "history-detail-label";
      heading.style.fontSize = "0.85rem";
      heading.textContent = cat;
      results.appendChild(heading);

      byCat[cat].forEach((dish) => {
        results.appendChild(renderCard(dish));
      });
    });
  }

  function filterDishes(query) {
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? allDishes
      : allDishes.filter((d) =>
          (d.dish + " " + d.instructions + " " + d.category).toLowerCase().includes(q)
        );
    renderList(filtered);
  }

  function loadReheats() {
    const results = document.getElementById("reheats-results");
    Papa.parse("assets/reheat-instructions.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        allDishes = normalizeRows(res.data);
        if (!allDishes.length) {
          results.innerHTML = '<p class="hint">No reheat instructions are published yet — check back soon.</p>';
          return;
        }
        document.getElementById("reheats-search-wrap").style.display = "block";
        renderList(allDishes);
      },
      error: () => {
        results.innerHTML = '<p class="hint">Couldn\'t load reheat instructions right now.</p>';
      },
    });
  }

  document.getElementById("reheats-search").addEventListener("input", (e) => {
    filterDishes(e.target.value);
  });

  loadReheats();
})();
