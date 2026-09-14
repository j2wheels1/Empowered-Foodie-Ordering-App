/* Empowered Foodie — nav date labels
   Included on every page. Reads THIS_WEEK_DATES / NEXT_WEEK_DATES
   from config.js and appends them to the "This Week's Reheats" /
   "Next Week's Reheats" nav links, so clients can see at a glance
   which dates each page covers without having to click in. Update
   just those two lines in config.js each week — nothing here or
   anywhere else needs to change. */

(function () {
  const cfg = window.EF_CONFIG || {};

  const thisWeekLink = document.getElementById("nav-this-week");
  if (thisWeekLink) {
    thisWeekLink.textContent = cfg.THIS_WEEK_DATES
      ? `This Week's Reheats (${cfg.THIS_WEEK_DATES})`
      : "This Week's Reheats";
  }

  const nextWeekLink = document.getElementById("nav-next-week");
  if (nextWeekLink) {
    nextWeekLink.textContent = cfg.NEXT_WEEK_DATES
      ? `Next Week's Reheats (${cfg.NEXT_WEEK_DATES})`
      : "Next Week's Reheats";
  }
})();
