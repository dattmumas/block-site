/* Block plate math, ported line by line from ios/Shared/Model/PlateMath.swift.
   Plate sizes are in the gym's unit (lb or kg). The bar drawing follows
   ios/Shared/DesignSystem/PlateBar.swift. Loads as a classic script in the
   browser (window.PlateMath) and with require() in node (tools/site/plates_test.mjs). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) { module.exports = api; }
  else { root.PlateMath = api; }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // MARK: Specs. Heights use a scale where a full plate is 100 tall.
  function spec(color, thickness, bumperHeight, ironHeight) {
    return { color: color, thickness: thickness, bumperHeight: bumperHeight, ironHeight: ironHeight };
  }
  var lbSpecs = new Map([
    [55, spec("#D9302F", 19, 100, 100)],
    [45, spec("#2E6FE8", 17, 100, 100)],
    [35, spec("#F2C31B", 15, 100, 88)],
    [25, spec("#22A85A", 12.5, 100, 78)],
    [10, spec("#ECEAE4", 9, 100, 58)],
    [5, spec("#5F666D", 7, 52, 48)],
    [2.5, spec("#B9BFC5", 5.5, 42, 38)],
  ]);
  // IWF colors.
  var kgSpecs = new Map([
    [25, spec("#D9302F", 19, 100, 100)],
    [20, spec("#2E6FE8", 17, 100, 100)],
    [15, spec("#F2C31B", 15, 100, 90)],
    [10, spec("#22A85A", 12.5, 100, 80)],
    [5, spec("#ECEAE4", 9, 58, 58)],
    [2.5, spec("#D9302F", 7, 46, 46)],
    [1.25, spec("#B9BFC5", 5.5, 38, 38)],
  ]);
  var unknown = spec("#8C9298", 8, 60, 60);

  function plateSpec(plate, unit) {
    return (unit === "kg" ? kgSpecs : lbSpecs).get(plate) || unknown;
  }

  /** Every plate size the app knows, heaviest first. */
  function standardPlates(unit) {
    return unit === "kg" ? [25, 20, 15, 10, 5, 2.5, 1.25] : [55, 45, 35, 25, 10, 5, 2.5];
  }

  /** A typical gym: no 55 lb plates. */
  function defaultStock(unit) {
    return unit === "kg" ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
  }

  function bars(unit) {
    return unit === "kg"
      ? [{ weight: 20, name: "Men’s" }, { weight: 15, name: "Women’s" }, { weight: 10, name: "Technique" }]
      : [{ weight: 45, name: "Olympic" }, { weight: 35, name: "Women’s" }, { weight: 25, name: "EZ" }, { weight: 15, name: "Technique" }];
  }

  function defaultBar(unit) { return unit === "kg" ? 20 : 45; }

  /** The usual jump for a load change: 5 lb or 2.5 kg. */
  function step(unit) { return unit === "kg" ? 2.5 : 5; }

  // MARK: Helpers

  function desc(a) { return a.slice().sort(function (x, y) { return y - x; }); }
  function sum(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return t; }
  /** Swift's .rounded(): to nearest, ties away from zero. */
  function swiftRound(x) { return x < 0 ? -Math.round(-x) : Math.round(x); }
  /** Fmt.number: up to two fraction digits, grouped. */
  function fmt(value) {
    return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function join(plates) { return plates.map(fmt).join(" + "); }

  // MARK: Solving

  /** Fewest plates per side that make `total` on `bar`, heaviest first.
      [] for the bare bar. null when the stock cannot make it exactly. */
  function solve(total, bar, stock) {
    var perSide = (total - bar) / 2;
    if (!(perSide > -0.001) || !isFinite(total)) return null;
    // Quarter units make every standard plate a whole number (1.25 kg = 5).
    var target = swiftRound(perSide * 4);
    if (!(Math.abs(target - perSide * 4) < 0.01) || target > 40000) return null;
    if (target === 0) return [];
    var plates = desc(stock.filter(function (p) { return p > 0; }));
    var coins = plates.map(function (p) { return swiftRound(p * 4); });
    var MAX = Number.MAX_SAFE_INTEGER;
    var best = new Array(target + 1).fill(MAX);
    var from = new Array(target + 1).fill(-1);
    best[0] = 0;
    for (var x = 1; x <= target; x++) {
      for (var i = 0; i < coins.length; i++) {
        var c = coins[i];
        if (!(c > 0 && c <= x && best[x - c] !== MAX)) continue;
        if (best[x - c] + 1 < best[x]) {
          best[x] = best[x - c] + 1;
          from[x] = i;
        }
      }
    }
    if (best[target] === MAX) return null;
    var out = [];
    var y = target;
    while (y > 0) {
      var k = from[y];
      out.push(plates[k]);
      y -= coins[k];
    }
    return desc(out);
  }

  /** Plates for `total` during a warm-up, starting from the plates already on
      and heading for the work set's plates. Big plates sit inside, so a change
      keeps some of the largest plates and replaces the rest. Picks the fewest
      changes over both moves, then the fewest changes now, then the fewest
      plates: 95 to 135 swaps 25 for 45; 135 to 165 adds 10 + 5. */
  function solveKeeping(total, bar, stock, current, work) {
    current = desc(current);
    var perSide = (total - bar) / 2;
    var best = null;
    for (var k = 0; k <= current.length; k++) {
      var kept = current.slice(0, k);
      var rest = perSide - sum(kept);
      if (!(rest > -0.001)) continue;
      var extra = solve(bar + 2 * rest, bar, stock);
      if (extra === null) continue;
      var plates = desc(kept.concat(extra));
      var now = (current.length - k) + extra.length;
      var then = changes(plates, work);
      var key = [now + then, now, plates.length];
      if (best === null || lessKey(key, best.key)) best = { plates: plates, key: key };
    }
    return best ? best.plates : null;
  }

  function lessKey(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return true;
      if (a[i] > b[i]) return false;
    }
    return false;
  }

  /** Plates taken off plus plates put on, keeping the largest plates that match. */
  function changes(oldPlates, newPlates) {
    var a = desc(oldPlates), b = desc(newPlates);
    var common = 0;
    while (common < Math.min(a.length, b.length) && Math.abs(a[common] - b[common]) < 0.001) common += 1;
    return (a.length - common) + (b.length - common);
  }

  /** The smallest step between two makeable totals: two of the lightest plate. */
  function increment(stock) {
    var positive = stock.filter(function (p) { return p > 0; });
    var min = positive.length ? Math.min.apply(null, positive) : 2.5;
    return min * 2;
  }

  /** Closest makeable totals strictly below and above `total`. Only totals on
      the grid of the smallest change (two of the lightest plate) can be made. */
  function nearest(total, bar, stock) {
    var inc = increment(stock);
    var x = (total - bar) / inc;
    var below = null, above = null;
    var k = Math.ceil(x - 1e-6) - 1;
    for (var i = 0; i < 24; i++) {
      if (!(below === null && k >= 0)) continue;
      if (solve(bar + k * inc, bar, stock) !== null) below = bar + k * inc;
      k -= 1;
    }
    var j = Math.max(0, Math.floor(x + 1e-6) + 1);
    for (var n = 0; n < 24; n++) {
      if (!(above === null)) continue;
      if (solve(bar + j * inc, bar, stock) !== null) above = bar + j * inc;
      j += 1;
    }
    return { below: below, above: above };
  }

  /** A total the stock can make, near `total`. rounding: "nearest" (ties go
      down), "up" (the lightest makeable total at or above) or "down". */
  function makeable(total, bar, stock, rounding) {
    rounding = rounding || "nearest";
    if (total <= bar) return bar;
    if (solve(total, bar, stock) !== null) return total;
    var n = nearest(total, bar, stock);
    var below = n.below, above = n.above;
    switch (rounding) {
      case "up": return above !== null ? above : (below !== null ? below : total);
      case "down": return below !== null ? below : (above !== null ? above : total);
      default:
        if (below === null) return above !== null ? above : total;
        if (above === null) return below;
        return (total - below) <= (above - total) ? below : above;
    }
  }

  // MARK: Loading

  /** Plates to take off and put on, per side, going from one load to the next. */
  function change(oldPlates, newPlates) {
    var remaining = oldPlates.slice();
    var on = [];
    for (var i = 0; i < newPlates.length; i++) {
      var p = newPlates[i];
      var idx = -1;
      for (var r = 0; r < remaining.length; r++) {
        if (Math.abs(remaining[r] - p) < 0.001) { idx = r; break; }
      }
      if (idx >= 0) remaining.splice(idx, 1); else on.push(p);
    }
    return { off: desc(remaining), on: desc(on) };
  }

  /** "10 + 5 OFF · 25 ON", "ADD 25", "SAME BAR", "EMPTY BAR". */
  function changeText(oldPlates, newPlates) {
    if (oldPlates === null || oldPlates === undefined) {
      return newPlates.length === 0 ? "EMPTY BAR" : join(newPlates) + " PER SIDE";
    }
    var c = change(oldPlates, newPlates);
    if (c.off.length === 0 && c.on.length === 0) return "SAME BAR";
    if (c.off.length === 0) return "ADD " + join(c.on);
    if (c.on.length === 0) return newPlates.length === 0 ? "EMPTY BAR" : join(c.off) + " OFF";
    return join(c.off) + " OFF · " + join(c.on) + " ON";
  }

  /** Warm-up steps up to a working load: the bare bar, then about 50, 70
      and 90 percent. Each step picks a nearby load that needs few plates,
      so the bar is quick to change (135 before 130). */
  function warmups(work, bar, stock) {
    if (!(work > bar + 0.001)) return [];
    var steps = [{ load: bar, reps: 10 }];
    var inc = increment(stock);
    var plan = [{ pct: 0.5, window: 0.07, reps: 5 }, { pct: 0.7, window: 0.07, reps: 3 }, { pct: 0.9, window: 0.05, reps: 2 }];
    for (var i = 0; i < plan.length; i++) {
      var p = plan[i];
      var aim = work * p.pct;
      var lo = aim - work * p.window;
      var hi = aim + work * p.window;
      var bestLoad = null;
      var bestCount = Number.MAX_SAFE_INTEGER, bestDist = Infinity;
      var t = bar + inc;
      while (t <= hi + 0.001) {
        if (t >= lo - 0.001) {
          var plates = solve(t, bar, stock);
          if (plates !== null) {
            var count = plates.length, dist = Math.abs(t - aim);
            if (count < bestCount || (count === bestCount && dist < bestDist)) {
              bestCount = count; bestDist = dist; bestLoad = t;
            }
          }
        }
        t += inc;
      }
      var last = steps.length ? steps[steps.length - 1].load : bar;
      if (bestLoad === null) continue;
      if (!(bestLoad > last + work * 0.1 - 0.001)) continue;
      if (!(bestLoad < work - work * 0.05 + 0.001)) continue;
      steps.push({ load: bestLoad, reps: p.reps });
    }
    return steps;
  }

  // MARK: Drawing (PlateBar.swift's Geometry)

  /** Sizes in px for one side of a loaded bar: shaft, collar, plates, clamp
      and sleeve end. The design's units: a full plate is 100 tall in a 104 tall
      box. The shaft takes any extra width, so the plates always sit at the right. */
  function geometry(plates, unit, width, height, style) {
    var gapU = 2, shaftU = 26, collarU = 7, clampU = 8.5, endU = 22;
    var specs = plates.map(function (p) { return plateSpec(p, unit); });
    var platesU = 0;
    specs.forEach(function (s) { platesU += s.thickness; });
    var natural = shaftU + collarU + platesU + clampU + endU + gapU * (specs.length + 3);
    var s = height / 104;
    if (natural * s > width) s = width / natural;
    var extra = Math.max(0, width - natural * s);
    function px(u) { return Math.round(u * s * 10) / 10; }
    return {
      plates: specs.map(function (sp, i) {
        return { value: plates[i], color: sp.color, width: px(sp.thickness),
                 height: px(style === "iron" ? sp.ironHeight : sp.bumperHeight) };
      }),
      gap: px(gapU),
      shaftW: shaftU * s + extra, shaftH: Math.max(2, px(6)),
      collarW: px(collarU), collarH: px(25),
      clampW: px(clampU), clampH: px(17),
      endW: px(endU), endH: Math.max(2.5, px(10)),
      radius: Math.max(1.5, px(3)), rim: Math.max(1.5, px(2.4)),
      width: width, height: height,
    };
  }

  var BAR = { shaft: "#8C9298", collar: "#AAB0B6", clamp: "#6C737A", iron: "#262626" };

  function r1(n) { return Math.round(n * 100) / 100; }

  /** SVG markup for one side of the bar. opts: {width, height, style, unit,
      animate (plates slide on, staggered), label (accessible name)}. */
  function barSVG(plates, opts) {
    opts = opts || {};
    var unit = opts.unit || "lb";
    var W = opts.width || 320, H = opts.height || 64;
    var g = geometry(plates, unit, W, H, opts.style || "bumper");
    var cy = H / 2;
    var x = 0;
    var parts = [];
    function rect(w, h, fill, rx, cls, extraAttrs) {
      parts.push('<rect x="' + r1(x) + '" y="' + r1(cy - h / 2) + '" width="' + r1(w) + '" height="' + r1(h) + '"' +
        (rx ? ' rx="' + r1(rx) + '"' : "") + ' fill="' + fill + '"' + (cls ? ' class="' + cls + '"' : "") +
        (extraAttrs || "") + "/>");
      x += w + g.gap;
    }
    rect(g.shaftW, g.shaftH, BAR.shaft, 0, "bar-shaft");
    rect(g.collarW, g.collarH, BAR.collar, 2, "bar-collar");
    g.plates.forEach(function (p, i) {
      var attrs = ' data-plate="' + p.value + '"' + (opts.animate ? ' style="--i:' + i + '"' : "");
      if ((opts.style || "bumper") === "iron") {
        var rim = g.rim;
        parts.push('<g class="plate"' + attrs + '><rect x="' + r1(x) + '" y="' + r1(cy - p.height / 2) + '" width="' + r1(p.width) +
          '" height="' + r1(p.height) + '" rx="' + r1(g.radius) + '" fill="' + BAR.iron + '" stroke="' + p.color +
          '" stroke-width="' + r1(rim) + '"/></g>');
        x += p.width + g.gap;
      } else {
        rect(p.width, p.height, p.color, g.radius, "plate", attrs);
      }
    });
    rect(g.clampW, g.clampH, BAR.clamp, 2, "bar-clamp");
    // The sleeve end: rounded on the right only.
    var ex = x, ey = cy - g.endH / 2, ew = g.endW, eh = g.endH, er = Math.min(3, eh / 2);
    parts.push('<path class="bar-end" fill="' + BAR.collar + '" d="M' + r1(ex) + ' ' + r1(ey) + 'h' + r1(ew - er) +
      'a' + er + ' ' + er + ' 0 0 1 ' + er + ' ' + er + 'v' + r1(eh - 2 * er) + 'a' + er + ' ' + er + ' 0 0 1 -' + er + ' ' + er +
      'h-' + r1(ew - er) + 'z"/>');
    var label = opts.label || (plates.length === 0 ? "Empty bar" : join(plates) + " " + unit + " per side");
    return '<svg class="bar' + (opts.className ? " " + opts.className : "") + '" viewBox="0 0 ' + W + " " + H +
      '" width="' + W + '" height="' + H + '" role="img" aria-label="' + label.replace(/"/g, "&quot;") + '">' +
      parts.join("") + "</svg>";
  }

  return {
    spec: plateSpec, standardPlates: standardPlates, defaultStock: defaultStock, bars: bars,
    defaultBar: defaultBar, step: step, solve: solve, solveKeeping: solveKeeping, changes: changes,
    increment: increment, nearest: nearest, makeable: makeable, change: change, changeText: changeText,
    join: join, fmt: fmt, warmups: warmups, geometry: geometry, barSVG: barSVG, colors: BAR,
  };
});
