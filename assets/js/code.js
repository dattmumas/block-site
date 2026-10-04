/* /code/: shows the offer code from ?c=CODE. Only A to Z and 0 to 9 are kept, and the
   code is only ever written as text (textContent), never as markup. Before launch
   (no App Store ID in config.js) the page says codes open on launch day. After
   launch it links to the offer code URL (marketing/BRIEF.md section 5). */
(function () {
  "use strict";
  function clean(raw) {
    return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 64);
  }

  var params = new URLSearchParams(window.location.search);
  var code = clean(params.get("c"));
  var store = window.BLOCK_STORE || { launched: false };

  var value = document.getElementById("code-value");
  var hasCode = document.getElementById("code-has");
  var noCode = document.getElementById("code-none");
  var before = document.getElementById("code-before");
  var after = document.getElementById("code-after");
  var redeem = document.getElementById("code-redeem");
  var input = document.getElementById("code-input");

  if (code) {
    value.textContent = code;
    hasCode.hidden = false;
    noCode.hidden = true;
    document.title = "Your code " + code + " for Block Pro";
    if (input) input.value = code;
  } else {
    hasCode.hidden = true;
    noCode.hidden = false;
  }

  if (store.launched && code) {
    redeem.href = store.offerURL(code);
    after.hidden = false;
    before.hidden = true;
  } else {
    after.hidden = true;
    before.hidden = !code;
  }

  var form = document.getElementById("code-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var next = clean(input.value);
      if (!next) { input.focus(); return; }
      window.location.search = "?c=" + next;
    });
  }
})();
