/* /plates/: the plate calculator. Every number comes from platemath.js, the port of
   ios/Shared/Model/PlateMath.swift (tested by tools/site/plates_test.mjs). The screen
   follows the app's Your gym screen (GymView.swift). Its warm-up steps are the calculator's own: the app builds no warm-ups.
   The state lives in the address (?unit=lb&bar=45&plates=45,25,10&load=185), so a load
   can be shared as a link. Nothing is stored and nothing is sent. */
(function () {
  "use strict";
  var PM = window.PlateMath;
  var root = document.getElementById("calc");
  if (!PM || !root) return;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var UNIT_WORD = { lb: "pounds", kg: "kilograms" };
  var MAX = { lb: 2000, kg: 1000 };

  function $(sel) { return root.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function fmt(n) { return PM.fmt(n); }
  function plain(n) { return fmt(n).replace(/,/g, ""); }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  /** A plate light enough to need an edge on whiteboard white (10 lb, 5 kg). */
  function light(hex) {
    var n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 200;
  }

  /** What changes on the bar, in plain words: "Add 25", "Replace 25 with 45". */
  function changeWords(prev, plates) {
    if (prev == null) return plates.length ? PM.join(plates) + " per side" : "Empty bar";
    var c = PM.change(prev, plates);
    if (!c.off.length && !c.on.length) return "Same plates";
    if (!c.off.length) return "Add " + PM.join(c.on);
    if (!c.on.length) return plates.length ? "Remove " + PM.join(c.off) : "Empty bar";
    return "Replace " + PM.join(c.off) + " with " + PM.join(c.on);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var state = { unit: "lb", bar: 45, plates: PM.defaultStock("lb"), load: 185 };
  var shown = null;

  // MARK: The address

  function readURL() {
    var q = new URLSearchParams(window.location.search);
    var unit = q.get("unit") === "kg" ? "kg" : "lb";
    state.unit = unit;
    var bars = PM.bars(unit).map(function (b) { return b.weight; });
    var bar = Number(q.get("bar"));
    state.bar = bars.indexOf(bar) >= 0 ? bar : PM.defaultBar(unit);
    var known = PM.standardPlates(unit);
    if (q.has("plates")) {
      var picked = (q.get("plates") || "").split(",").map(Number).filter(function (p) { return known.indexOf(p) >= 0; });
      state.plates = known.filter(function (p) { return picked.indexOf(p) >= 0; });
    } else {
      state.plates = PM.defaultStock(unit);
    }
    var load = Number(q.get("load"));
    state.load = isFinite(load) && load > 0 ? clampLoad(load) : (unit === "kg" ? 85 : 185);
  }

  function writeURL() {
    var q = "?unit=" + state.unit + "&bar=" + plain(state.bar) + "&plates=" + state.plates.map(plain).join(",") + "&load=" + plain(state.load);
    try { window.history.replaceState(null, "", window.location.pathname + q); } catch (e) { /* file:// or a sandbox */ }
  }

  function clampLoad(v) {
    v = Number(v);
    if (!isFinite(v)) v = state.bar;
    return Math.min(MAX[state.unit], Math.max(state.bar, Math.round(v * 4) / 4));
  }

  // MARK: Controls

  function buildChips() {
    var unit = state.unit;
    var bars = $("#c-bars");
    bars.textContent = "";
    PM.bars(unit).forEach(function (b) {
      var label = el("label", "chip");
      var input = el("input");
      input.type = "radio"; input.name = "c-bar"; input.value = String(b.weight);
      input.checked = Math.abs(b.weight - state.bar) < 0.001;
      var face = el("span");
      face.appendChild(el("span", "n", fmt(b.weight)));
      face.appendChild(el("span", "label", b.name));
      face.appendChild(el("span", "sr-only", " " + unit + " bar"));
      label.appendChild(input); label.appendChild(face);
      bars.appendChild(label);
      input.addEventListener("change", function () {
        if (!input.checked) return;
        state.bar = b.weight;
        state.load = clampLoad(Math.max(state.load, b.weight));
        update(true);
      });
    });

    var plates = $("#c-plates");
    plates.textContent = "";
    PM.standardPlates(unit).forEach(function (p) {
      var label = el("label", "chip");
      var input = el("input");
      input.type = "checkbox"; input.name = "c-plate"; input.value = String(p);
      input.checked = state.plates.indexOf(p) >= 0;
      var face = el("span");
      // The plate seen side on, by its thickness and height (PlateMath.spec), in its color.
      var spec = PM.spec(p, unit);
      var glyph = el("i", light(spec.color) ? "light" : null);
      glyph.style.setProperty("--swatch", spec.color);
      glyph.style.setProperty("--pw", String(spec.thickness));
      glyph.style.setProperty("--ph", String(spec.bumperHeight));
      face.appendChild(glyph);
      face.appendChild(el("span", "n", fmt(p)));
      face.appendChild(el("span", "sr-only", " " + unit + " plates"));
      label.appendChild(input); label.appendChild(face);
      plates.appendChild(label);
      input.addEventListener("change", function () {
        var set = state.plates.filter(function (x) { return x !== p; });
        if (input.checked) set.push(p);
        state.plates = PM.standardPlates(unit).filter(function (x) { return set.indexOf(x) >= 0; });
        update(true);
      });
    });

    all("[data-unit-label]").forEach(function (e) { e.textContent = unit; });
    var step = PM.step(unit);
    $("#c-minus").setAttribute("aria-label", "Take off " + fmt(step) + " " + unit);
    $("#c-plus").setAttribute("aria-label", "Add " + fmt(step) + " " + unit);
    var target = $("#c-target");
    target.step = String(step);
    target.min = String(state.bar);
    all('input[name="c-unit"]').forEach(function (r) { r.checked = r.value === unit; });
  }

  // MARK: The result

  function drawBar(box, plates, animate) {
    var width = Math.max(240, Math.round(box.clientWidth || 520));
    var height = Math.round(Math.max(84, Math.min(160, width * 0.2)));
    var old = shown || [];
    var common = 0;
    while (common < old.length && common < plates.length && Math.abs(old[common] - plates[common]) < 0.001) common++;
    shown = plates.slice();
    function render() {
      box.innerHTML = PM.barSVG(plates, { unit: state.unit, width: width, height: height });
      if (animate) {
        Array.prototype.forEach.call(box.querySelectorAll(".plate"), function (p, i) {
          if (i >= common) { p.style.setProperty("--i", i - common); p.classList.add("on"); }
        });
      }
    }
    window.clearTimeout(drawBar.timer);
    if (animate && old.length > common) {
      // Plates both loads share stay. Changed plates slide off, then new ones slide on.
      Array.prototype.forEach.call(box.querySelectorAll(".plate"), function (p, i) { if (i >= common) p.classList.add("off"); });
      drawBar.timer = window.setTimeout(render, 140);
    } else {
      render();
    }
  }

  function ladder(work, workPlates) {
    var steps = PM.warmups(work, state.bar, state.plates);
    var box = $("#c-ladder");
    box.textContent = "";
    if (!steps.length) { $("#c-warm").hidden = true; return; }
    $("#c-warm").hidden = false;
    $("#c-warm-title").textContent = "Warm-ups to " + fmt(work) + " " + state.unit;
    box.setAttribute("aria-label", "Warm-ups to " + fmt(work) + " " + state.unit);
    var rows = [];
    var prev = null;
    steps.forEach(function (s) {
      var plates = PM.solveKeeping(s.load, state.bar, state.plates, prev || [], workPlates) ||
        PM.solve(PM.makeable(s.load, state.bar, state.plates), state.bar, state.plates) || [];
      rows.push({ load: s.load, reps: s.reps, plates: plates, prev: prev });
      prev = plates;
    });
    rows.push({ load: work, reps: null, plates: workPlates, prev: prev, work: true });
    rows.forEach(function (r, i) {
      var row = el("div", "step");
      row.setAttribute("role", "row");
      var k = el("span", "k" + (r.work ? " now" : ""), r.work ? "Work" : (i === 0 && r.plates.length === 0 ? "Bar" : String(i)));
      k.setAttribute("role", "cell");
      var v = el("span", "v");
      v.setAttribute("role", "cell");
      v.appendChild(el("span", "num heavy", fmt(r.load) + (r.reps != null ? " × " + r.reps : "")));
      v.appendChild(el("span", "label" + (r.work ? " chalk" : ""), changeWords(r.prev, r.plates)));
      row.appendChild(k); row.appendChild(v);
      var pic = el("span", "pic");
      pic.setAttribute("role", "cell");
      pic.innerHTML = PM.barSVG(r.plates, { unit: state.unit, width: 180, height: 40 });
      row.appendChild(pic);
      box.appendChild(row);
    });
  }

  var announce = (function () {
    var timer = 0;
    return function (text) {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { $("#c-status").textContent = text; }, 450);
    };
  })();

  function jump(load) {
    state.load = clampLoad(load);
    update(true);
    $("#c-target").focus();
  }

  function update(animate) {
    var unit = state.unit;
    $("#c-target").value = plain(state.load);
    $("#c-target").min = String(state.bar);
    $("#c-total").textContent = fmt(state.load);
    $("#c-unit").textContent = unit.toUpperCase();
    var solved = PM.solve(state.load, state.bar, state.plates);
    drawBar($("#c-bar"), solved || [], animate && !reduced);
    var miss = $("#c-miss");
    if (solved) {
      miss.hidden = true;
      $("#c-fit").hidden = false;
      $("#c-per-side").textContent = solved.length ? PM.join(solved) + " per side" : "Empty bar";
      $("#c-count").textContent = plural(solved.length * 2, "plate") + " on the bar";
      ladder(state.load, solved);
      announce(fmt(state.load) + " " + UNIT_WORD[unit] + ": " +
        (solved.length ? PM.join(solved) + " per side, " + plural(solved.length * 2, "plate") + " on the bar." : "the empty bar."));
    } else {
      miss.hidden = false;
      $("#c-fit").hidden = true;
      $("#c-warm").hidden = true;
      $("#c-miss-text").textContent = "Cannot make " + fmt(state.load) + " exactly";
      var n = PM.nearest(state.load, state.bar, state.plates);
      var near = $("#c-nearest");
      near.textContent = "";
      var loads = [n.below, n.above].filter(function (x) { return x != null; });
      if (loads.length) {
        near.appendChild(el("span", "label chalk", "Closest"));
        loads.forEach(function (x) {
          var b = el("button", "btn secondary", fmt(x));
          b.type = "button";
          b.setAttribute("aria-label", "Set the target to " + fmt(x) + " " + unit);
          b.addEventListener("click", function () { jump(x); });
          near.appendChild(b);
        });
      }
      if (!state.plates.length) near.appendChild(el("span", "label chalk", "Add plates to the rack"));
      announce("Cannot make " + fmt(state.load) + " " + UNIT_WORD[unit] + " exactly." +
        (loads.length ? " Closest: " + loads.map(fmt).join(" or ") + "." : ""));
    }
    writeURL();
  }

  // MARK: Wiring

  // Enter in a number field commits it, as a form would.
  root.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !e.target.matches('input[type="number"]')) return;
    e.preventDefault();
    e.target.dispatchEvent(new Event("change", { bubbles: true }));
  });
  all('input[name="c-unit"]').forEach(function (r) {
    r.addEventListener("change", function () {
      if (!r.checked || r.value === state.unit) return;
      state.unit = r.value;
      state.bar = PM.defaultBar(state.unit);
      state.plates = PM.defaultStock(state.unit);
      state.load = state.unit === "kg" ? 85 : 185;
      shown = null;
      buildChips();
      update(false);
    });
  });
  var target = $("#c-target");
  target.addEventListener("change", function () {
    var load = clampLoad(target.value);
    // The browser can fire change again on blur for a value already committed with Enter.
    if (Math.abs(load - state.load) < 0.001) { target.value = plain(state.load); return; }
    state.load = load;
    update(true);
  });
  $("#c-minus").addEventListener("click", function () { state.load = clampLoad(state.load - PM.step(state.unit)); update(true); });
  $("#c-plus").addEventListener("click", function () { state.load = clampLoad(state.load + PM.step(state.unit)); update(true); });

  // Draw the bar again when its box changes width: a resize, or the web font arriving.
  var barBox = $("#c-bar"), drawnWidth = 0, resizeTimer = 0;
  function redraw() {
    var w = Math.round(barBox.clientWidth);
    if (!w || w === drawnWidth) return;
    drawnWidth = w;
    drawBar(barBox, shown || [], false);
  }
  if (window.ResizeObserver) new ResizeObserver(redraw).observe(barBox);
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(redraw, 120);
  });

  readURL();
  root.hidden = false;
  var fallback = document.getElementById("calc-static");
  if (fallback) fallback.hidden = true;
  buildChips();
  update(false);
})();
