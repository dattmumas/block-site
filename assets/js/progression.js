/* /progression/: lift the last set of Back Squat 3 × 8 and see the lamps and the next target.
   The judging is the app's (judge.js: in kg as the app saves a set, the estimated-max pass and
   the lift's target RPE) and the card line follows Rulebook.line (ios/Liftbook/Services/Trainer.swift)
   for a barbell lift with straight sets. Back Squat is a big lower-body lift (Exercise.isBigLowerBody),
   so its step is 10 lb or 5 kg (LoadRules.step); the load field steps by the unit's plates.
   Loads fit the plates with PlateMath (platemath.js). */
(function () {
  "use strict";
  var PM = window.PlateMath;
  var J = window.BlockJudge;
  var root = document.getElementById("demo");
  if (!PM || !J || !root) return;

  var UNITS = {
    lb: { declared: 185, step: 10, input: 5, bar: 45, stock: PM.defaultStock("lb"), name: "lb", spoken: "pounds" },
    kg: { declared: 85, step: 5, input: 2.5, bar: 20, stock: PM.defaultStock("kg"), name: "kg", spoken: "kilograms" },
  };
  var TARGET_REPS = 8;
  var TARGET_RPE = J.DEFAULT_TARGET_RPE;
  var EARLIER_RPE = 7;

  function $(sel) { return root.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function fmt(n) { return PM.fmt(n); }
  function fmt1(n) { return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 }); }

  var state = { unit: "lb", reps: TARGET_REPS, load: UNITS.lb.declared, rpe: null, held: false };
  var shownPlates = null;
  var lastVerdict = null;

  /** Judge.lamps: REPS, LOAD, EFFORT. A set that beats the target's estimated max passes reps and
      load together; effort passes without an RPE, and at or under the target RPE. */
  function lamps(set, u) {
    var l = J.judgeSet(set, { load: u.declared, reps: TARGET_REPS, rpe: TARGET_RPE }, u.name);
    return l.split("").map(function (c) { return c === "R" ? "no" : "good"; });
  }

  function sets(u) {
    return [
      { reps: TARGET_REPS, load: u.declared, rpe: EARLIER_RPE },
      { reps: TARGET_REPS, load: u.declared, rpe: EARLIER_RPE },
      { reps: state.reps, load: state.load, rpe: state.rpe },
    ];
  }

  /** Rulebook.line for this lift: the load for next time, its tag and the reason. */
  function cardLine(u) {
    var s = sets(u);
    var judged = s.map(function (x) { return lamps(x, u); });
    var firstRed = -1;
    for (var i = 0; i < judged.length; i++) {
      if (judged[i].indexOf("no") >= 0) { firstRed = i; break; }
    }
    if (firstRed >= 0) {
      if (state.held) {
        // A second red light in a row at this load: reset 10% to a load the plates make.
        var reset = PM.makeable(u.declared * 0.9, u.bar, u.stock, "nearest");
        return { load: reset, tag: "Reset", call: "reset", reason: "Second hold in a row. Build back from " + fmt(reset) + "." };
      }
      var l = judged[firstRed], n = firstRed + 1, reason;
      if (l[0] === "no") reason = "Short on reps in set " + n + ". Same load next time.";
      else if (l[1] === "no") reason = "Set " + n + " was under the planned load. Same load next time.";
      else reason = "RPE " + fmt1(s[firstRed].rpe == null ? 10 : s[firstRed].rpe) + " in set " + n + " is over its target of " + fmt1(TARGET_RPE) + ". Same load next time.";
      return { load: u.declared, tag: "Hold", call: "hold", reason: reason };
    }
    var rpe = null;
    s.forEach(function (x) { if (x.rpe != null && (rpe == null || x.rpe > rpe)) rpe = x.rpe; });
    var good = "3 good lifts" + (rpe != null ? " at RPE " + fmt1(rpe) : "");
    // Round toward the harder lift, so a gym without the smallest plates still moves up.
    var next = PM.makeable(u.declared + u.step, u.bar, u.stock, "up");
    var tooFar = next < u.declared - 0.01 || next > u.declared + Math.max(2 * u.step, u.declared * 0.1) + 0.01;
    if (tooFar) {
      return { load: u.declared, tag: "Hold", call: "hold", reason: good + ". No load within reach your plates can make. Same load next time." };
    }
    var d = Math.abs(next - u.declared);
    return { load: next, tag: d < 0.01 ? "Same" : "+" + fmt(d), call: d < 0.01 ? "same" : "up", reason: good + "." };
  }

  // MARK: Drawing

  function lampHTML(kind) { return '<span class="lamp' + (kind === "no" ? " no" : "") + '"></span>'; }

  /** "Reps", "Reps and load", "Reps, load and effort". */
  function words(list) {
    if (list.length < 2) return list.join("");
    return list.slice(0, -1).join(", ") + " and " + list[list.length - 1].toLowerCase();
  }

  function relight(el) {
    // Restart the lamp-on animation: all three together (BRIEF: lamps on).
    el.classList.remove("lit");
    void el.offsetWidth;
    el.classList.add("lit");
  }

  /** The next load on the bar. It changes without motion: the lamps are the page's one motion. */
  function drawBar(plates, u) {
    var box = $("#d-bar");
    var width = Math.max(240, Math.round(box.clientWidth || 480));
    var height = width < 420 ? 80 : 96;
    var label = (plates.length ? PM.join(plates) + " " + u.name + " per side" : "Empty bar");
    box.innerHTML = PM.barSVG(plates, { unit: u.name, width: width, height: height, label: label });
    shownPlates = plates.slice();
  }

  var announce = (function () {
    var timer = 0;
    return function (text) {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { $("#d-status").textContent = text; }, 450);
    };
  })();

  function update(animate) {
    var u = UNITS[state.unit];
    var set3 = { reps: state.reps, load: state.load, rpe: state.rpe };
    var l = lamps(set3, u);
    var good = l.indexOf("no") < 0;
    var names = ["Reps", "Load", "Effort"];

    // The sets table
    all("[data-planned]").forEach(function (el) { el.textContent = fmt(u.declared); });
    all("[data-unit]").forEach(function (el) { el.textContent = u.name; });
    $("#d-set3").textContent = fmt(state.load) + " × " + state.reps + (state.rpe == null ? ", no RPE" : " at RPE " + fmt1(state.rpe));
    $("#d-set3-lamps").innerHTML = l.map(lampHTML).join("");

    // The lamps and the verdict
    var cells = all("#d-lamps .cell");
    l.forEach(function (kind, i) {
      cells[i].className = "cell" + (kind === "no" ? " no" : "");
      cells[i].querySelector(".lamp").className = "lamp" + (kind === "no" ? " no" : "");
    });
    var verdict = good ? "Good lift" : "No lift";
    var reasons = names.filter(function (n, i) { return l[i] === "no"; });
    var key = l.join(",");
    if (key !== lastVerdict) {
      $("#d-verdict").textContent = verdict;
      if (animate) {
        relight($("#d-lamps"));
        var v = $("#d-verdict");
        v.classList.remove("rise"); void v.offsetWidth; v.classList.add("rise");
      }
      lastVerdict = key;
    }
    $("#d-reasons").textContent = words(reasons);
    $("#d-reasons").hidden = good;

    // The next target
    var line = cardLine(u);
    $("#d-why").textContent = line.reason;
    $("#d-next").textContent = fmt(line.load);
    var tag = $("#d-tag");
    tag.textContent = line.tag;
    tag.className = "ct " + line.call;
    var plates = PM.solve(line.load, u.bar, u.stock) || [];
    $("#d-plates").textContent = plates.length ? PM.join(plates) + " per side" : "Empty bar";
    drawBar(plates, u);

    announce(verdict + (reasons.length ? ": " + words(reasons).toLowerCase() : "") +
      ". Next time " + fmt(line.load) + " " + u.spoken + ", " +
      (line.call === "up" ? "up " + fmt(line.load - u.declared) : line.tag.toLowerCase()) + ".");
  }

  // MARK: Controls

  function clampReps(v) { v = Math.round(Number(v)); return isFinite(v) ? Math.min(30, Math.max(0, v)) : TARGET_REPS; }
  function clampLoad(v) {
    var u = UNITS[state.unit];
    v = Number(v);
    if (!isFinite(v)) return u.declared;
    return Math.min(state.unit === "kg" ? 500 : 1100, Math.max(u.bar, Math.round(v * 4) / 4));
  }

  function setUnit(name) {
    state.unit = name;
    var u = UNITS[name];
    state.load = u.declared;
    $("#d-load").value = fmt(state.load).replace(/,/g, "");
    $("#d-load").step = String(u.input);
    $("#d-load").min = String(u.bar);
    all("[data-load-step]").forEach(function (b) { b.setAttribute("data-load-step", (b.getAttribute("data-load-step").charAt(0) === "-" ? "-" : "") + u.input); });
    all(".d-load-minus").forEach(function (b) { b.setAttribute("aria-label", "Take off " + fmt(u.input) + " " + u.name); });
    all(".d-load-plus").forEach(function (b) { b.setAttribute("aria-label", "Add " + fmt(u.input) + " " + u.name); });
    shownPlates = null;
    update(true);
  }

  // Enter in a number field commits it, as a form would.
  root.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !e.target.matches('input[type="number"]')) return;
    e.preventDefault();
    e.target.dispatchEvent(new Event("change", { bubbles: true }));
  });

  all('input[name="d-unit"]').forEach(function (r) {
    r.addEventListener("change", function () { if (r.checked) setUnit(r.value); });
  });
  all('input[name="d-rpe"]').forEach(function (r) {
    r.addEventListener("change", function () {
      if (r.checked) { state.rpe = r.value === "" ? null : Number(r.value); update(true); }
    });
  });
  $("#d-held").addEventListener("change", function (e) { state.held = e.target.checked; update(true); });

  var reps = $("#d-reps"), load = $("#d-load");
  reps.addEventListener("change", function () {
    var v = clampReps(reps.value);
    reps.value = v;
    if (v === state.reps) return;
    state.reps = v;
    update(true);
  });
  load.addEventListener("change", function () {
    var v = clampLoad(load.value);
    load.value = fmt(v).replace(/,/g, "");
    if (Math.abs(v - state.load) < 0.001) return;
    state.load = v;
    update(true);
  });
  all("[data-reps-step]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.reps = clampReps(state.reps + Number(b.getAttribute("data-reps-step")));
      reps.value = state.reps;
      update(true);
    });
  });
  all("[data-load-step]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.load = clampLoad(state.load + Number(b.getAttribute("data-load-step")));
      load.value = fmt(state.load).replace(/,/g, "");
      update(true);
    });
  });

  // Draw the bar again when its box changes width: a resize, or the web font arriving.
  var barBox = $("#d-bar"), drawnWidth = 0, resizeTimer = 0;
  function redraw() {
    var w = Math.round(barBox.clientWidth);
    if (!w || w === drawnWidth) return;
    drawnWidth = w;
    drawBar(shownPlates || [], UNITS[state.unit]);
  }
  if (window.ResizeObserver) new ResizeObserver(redraw).observe(barBox);
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(redraw, 120);
  });

  root.hidden = false;
  var fallback = document.getElementById("demo-static");
  if (fallback) fallback.hidden = true;
  update(false);
})();
