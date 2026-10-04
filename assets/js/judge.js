/* Block's lamps, copied line by line from lamps() in the app's MCP tools
   (supabase/functions/_shared/meetday_tools.mjs), which judges as the app's Judge.lamps and the
   server's app.lamps (supabase/tests/lamp_cases.json). Loads are in kg, as the app saves them.
   Loads as a classic script in the browser (window.BlockJudge) and with require() in node
   (tools/site/lamps_test.mjs checks it against the MCP tools' lamps() on the demo's inputs). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) { module.exports = api; }
  else { root.BlockJudge = api; }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KG_PER_LB = 0.45359237;
  /** The effort pass line of a lift without a target RPE. */
  var DEFAULT_TARGET_RPE = 8;

  /** A load in the lifter's unit as the app saves it: kg to the gram (SetPayload.kg). */
  function kg(load, unit) {
    var v = unit === "lb" ? load * KG_PER_LB : load;
    return Math.round(v * 1000) / 1000;
  }

  /** A load in whole grams, half away from zero: the lamps compare whole numbers. */
  function grams(x) {
    var g = Math.round(Math.abs(x) * 1000);
    return x < 0 ? -g : g;
  }

  /** "WWR" style lamps for a logged set (a workout_sets row, kg), or null when it is not judged. */
  function lamps(s, exerciseType) {
    var type = exerciseType == null ? "weight_reps" : exerciseType;
    // Warm-ups and drop sets are not judged.
    if (s.set_type === "warmup" || s.set_type === "dropset") return null;
    if (s.target_reps == null && s.target_weight_kg == null) return null;
    var reps = s.target_reps == null ? "O" : (s.reps == null ? -1 : s.reps) >= s.target_reps ? "W" : "R";
    var load = "O";
    if (s.target_weight_kg != null) {
      var w = grams(s.weight_kg == null ? 0 : s.weight_kg);
      // Within 10 g of the target. Assisted lifts: less assistance is the harder lift.
      var passed = type === "assisted_bodyweight" ? w <= grams(s.target_weight_kg) + 10 : w >= grams(s.target_weight_kg) - 10;
      load = passed ? "W" : "R";
    }
    // Load and reps weighed together: a set that beats the target's estimated max (Epley,
    // kg x (1 + reps / 30), less 10 g, here times 30 000) passes both, as 360 x 8 does against 365 x 6.
    if (type === "weight_reps" && s.target_weight_kg > 0 && s.target_reps > 0 && s.weight_kg > 0 && s.reps > 0 &&
        grams(s.weight_kg) * (30 + s.reps) >= grams(s.target_weight_kg) * (30 + s.target_reps) - 300) {
      reps = "W";
      load = "W";
    }
    // Effort passes at or under the set's target RPE (8 without one); no RPE is a pass.
    var effort = s.rpe == null || s.rpe <= (s.target_rpe == null ? DEFAULT_TARGET_RPE : s.target_rpe) ? "W" : "R";
    return reps + load + effort;
  }

  /**
   * The demo's set in the lifter's unit, judged against its target as the app judges it:
   * set {load, reps, rpe}, target {load, reps, rpe}, unit "lb" or "kg". Returns "WWR" style lamps.
   */
  function judgeSet(set, target, unit, exerciseType) {
    return lamps({
      set_type: "normal", weight_kg: kg(set.load, unit), reps: set.reps, rpe: set.rpe,
      target_weight_kg: kg(target.load, unit), target_reps: target.reps, target_rpe: target.rpe,
    }, exerciseType || "weight_reps");
  }

  return { kg: kg, lamps: lamps, judgeSet: judgeSet, DEFAULT_TARGET_RPE: DEFAULT_TARGET_RPE };
});
