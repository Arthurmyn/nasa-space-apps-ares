import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseValidation } from "../api/validate.ts";
import { metres, validationView } from "./validationView.ts";

const ok = {
  available: true,
  site_id: "gale-bx",
  status: "ok",
  n_points: 14097,
  raw: { mean_m: -4.664, std_m: 2.74, max_abs_m: 29.25, rmse_m: 5.41 },
  offset_corrected: { offset_m: -4.664, mean_m: 0, std_m: 2.74, max_abs_m: 24.59, rmse_m: 2.74 },
  source: { url: "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json", fetched_utc: "2026-11-15T06:40:04Z" },
};

describe("parseValidation", () => {
  it("reads an ok result with its numbers", () => {
    const v = parseValidation(ok);
    assert.ok(v.available && v.status === "ok");
    if (v.available) assert.equal(v.raw?.rmse_m, 5.41);
  });
  it("reads a result that could not be made, with its reason and no statistics", () => {
    const v = parseValidation({ available: true, site_id: "x", status: "insufficient_points", n_points: 3, reason: "Only 3 vertices.", source: ok.source });
    assert.ok(v.available);
    if (v.available) assert.deepEqual([v.status, v.reason, v.raw], ["insufficient_points", "Only 3 vertices.", null]);
  });
  it("passes the reason of an unavailable answer", () => {
    assert.deepEqual(parseValidation({ available: false, reason: "No validation has been run for this site" }), { available: false, reason: "No validation has been run for this site" });
  });
  it("never throws, and never shows an ok without its numbers", () => {
    for (const bad of [null, [], "x", { available: true }, { ...ok, status: "great" }, { ...ok, raw: undefined }, { ...ok, offset_corrected: { mean_m: 1 } }, { ...ok, n_points: "many" }]) {
      assert.equal(parseValidation(bad).available, false, JSON.stringify(bad));
    }
  });
});

describe("validationView", () => {
  it("shows N, mean, RMSE and the largest difference, in metres, from the file", () => {
    const v = validationView(parseValidation(ok));
    assert.equal(v.kind, "figures");
    if (v.kind === "figures") {
      assert.equal(v.n, 14097);
      assert.deepEqual(v.rows[0], { label: "Raw difference", mean: "−4.66 m", rmse: "5.41 m", max: "29.25 m" });
      assert.deepEqual(v.rows[1], { label: "After removing the offset", mean: "0.00 m", rmse: "2.74 m", max: "24.59 m" });
      assert.equal(v.offset, "−4.66 m");
      assert.equal(v.fetched, "2026-11-15");
    }
  });
  it("shows the reason when the comparison could not be made", () => {
    const v = validationView(parseValidation({ available: true, site_id: "x", status: "not_comparable", n_points: 50, reason: "Heights do not vary together.", source: ok.source }));
    assert.deepEqual(v, { kind: "not-computed", reason: "Heights do not vary together." });
  });
  it("says not available when there is no answer, and invents nothing", () => {
    assert.deepEqual(validationView({ available: false, reason: "No validation has been run for this site" }), { kind: "unavailable", reason: "No validation has been run for this site" });
    assert.equal(validationView(null).kind, "unavailable");
  });
});

describe("metres", () => {
  it("uses a real minus sign and two decimals", () => {
    assert.equal(metres(-0.004), "0.00 m");
    assert.equal(metres(-12.346), "−12.35 m");
    assert.equal(metres(Number.NaN), "–");
  });
});
