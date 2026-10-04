/* The store call to action. With no App Store ID (config.js), every [data-store]
   keeps its static text, "Coming soon to the App Store", as a plain element.
   With an ID, it becomes the campaign link from marketing/BRIEF.md section 5,
   with the page's token (the data-store value) in ct. Nothing here talks to
   the network. */
(function () {
  "use strict";
  var cfg = window.BLOCK || {};
  var appId = cfg.appId ? String(cfg.appId).replace(/\D/g, "") : "";
  var pt = cfg.providerToken ? String(cfg.providerToken).replace(/\D/g, "") : "";
  var badge = typeof cfg.badge === "string" && /^\/[\w\-./]+\.(svg|png)$/.test(cfg.badge) ? cfg.badge : "";

  function token(value) {
    // Campaign tokens: letters, digits and hyphens, 30 characters or fewer.
    var t = String(value || "site-home").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30);
    return t || "site-home";
  }

  function storeURL(ct) {
    return "https://apps.apple.com/app/apple-store/id" + appId + "?" +
      (pt ? "pt=" + pt + "&" : "") + "ct=" + encodeURIComponent(token(ct)) + "&mt=8";
  }

  function offerURL(code) {
    return "https://apps.apple.com/redeem?ctx=offercodes&id=" + appId + "&code=" + encodeURIComponent(code);
  }

  function render() {
    if (!appId) return;
    var spots = document.querySelectorAll("[data-store]");
    for (var i = 0; i < spots.length; i++) {
      var el = spots[i];
      var a = document.createElement("a");
      a.href = storeURL(el.getAttribute("data-store"));
      if (badge) {
        var img = document.createElement("img");
        img.src = badge;
        img.alt = "Download on the App Store";
        img.height = 52;
        a.className = "store-badge";
        a.appendChild(img);
      } else {
        a.className = "btn";
        a.textContent = "Get Block on the App Store";
      }
      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(a);
    }
    document.documentElement.classList.add("launched");
  }

  window.BLOCK_STORE = { appId: appId, launched: !!appId, storeURL: storeURL, offerURL: offerURL };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
