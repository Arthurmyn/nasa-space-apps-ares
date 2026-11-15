import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SiteGrid } from "../api/types.ts";
import { parseGeology } from "../api/validate.ts";
import { geologyCaveat, geologyLabel, geologyScope, terrainAt } from "./inspect.ts";
import type { GridMeta } from "./terrain.ts";

const meta: GridMeta = { width: 4, height: 4, cellM: 10, xMinM: -20, yMaxM: 20, radiusM: 3_396_190, centre: { lon: 137, lat: -4.8 } };
const grid: SiteGrid = { width: 4, height: 4, cell_m: 10, x_min_m: -20, y_max_m: 20, mars_radius_m: 3_396_190, slope_unit_deg: 0.5, slope_nodata: 255 };
const elevation = Float32Array.from({ length: 16 }, (_, i) => 100 + i);
const slope = Uint8Array.from({ length: 16 }, (_, i) => (i === 5 ? 255 : 20));

describe("terrainAt", () => {
  it("reads elevation and slope at the centre of the grid", () => {
    const t = terrainAt(meta, elevation, grid, meta.centre, slope, 137, -4.8);
    assert.ok(t.elevationM !== null && t.elevationM > 100 && t.elevationM < 116);
    assert.equal(t.slopeDeg, 10);
  });
  it("is null outside the grid", () => {
    assert.deepEqual(terrainAt(meta, elevation, grid, meta.centre, slope, 140, -4.8), { elevationM: null, slopeDeg: null });
  });
  it("is null for a missing file, per value", () => {
    assert.deepEqual(terrainAt(null, null, grid, meta.centre, slope, 137, -4.8), { elevationM: null, slopeDeg: 10 });
    const t = terrainAt(meta, elevation, null, meta.centre, null, 137, -4.8);
    assert.equal(t.slopeDeg, null);
    assert.ok(t.elevationM !== null);
  });
});

describe("geologyLabel and parseGeology", () => {
  const ok = {
    available: true, site_id: "gale-bx", unit: "Htu", name: "Hesperian transition undivided unit", scale: "1:20,000,000",
    source: { title: "Geologic Map of Mars (SIM 3292)", url: "https://pubs.usgs.gov/sim/3292/", citation: "Tanaka et al." }, note: "n",
  };
  it("shows the code and the name", () => assert.equal(geologyLabel(parseGeology(ok)), "Htu, Hesperian transition undivided unit"));
  it("shows No data when the map has nothing, when it failed, or before it answered", () => {
    assert.equal(geologyLabel(parseGeology({ available: false, reason: "outside" })), "No data");
    assert.equal(geologyLabel(null), "No data");
  });
  it("never throws on a wrong shape: that is no data", () => {
    for (const bad of [null, [], "x", { available: true }, { ...ok, unit: 5 }, { ...ok, source: null }]) assert.equal(parseGeology(bad).available, false);
  });
  it("always qualifies a unit with the map's own scale, from the answer", () => {
    assert.equal(geologyCaveat(parseGeology(ok)), "Coarse global map (1:20,000,000), not site-scale.");
    assert.equal(geologyCaveat(parseGeology({ ...ok, scale: "1:5,000,000" })), "Coarse global map (1:5,000,000), not site-scale.");
  });
  it("has no caveat when there is no unit to qualify", () => {
    assert.equal(geologyCaveat(parseGeology({ available: false, reason: "x" })), null);
    assert.equal(geologyCaveat(null), null);
  });
  it("says in words when the whole site is one unit, and only then", () => {
    assert.match(geologyScope(parseGeology({ ...ok, units_in_site: 1 })) ?? "", /whole site lies in this one unit/);
    assert.equal(geologyScope(parseGeology({ ...ok, units_in_site: 3 })), null);
    assert.equal(geologyScope(parseGeology(ok)), null, "an older backend does not say, so nothing is claimed");
    assert.equal(geologyScope(parseGeology({ ...ok, units_in_site: 0 })), null);
  });
  it("keeps the reason of an unavailable answer", () => {
    assert.deepEqual(parseGeology({ available: false, reason: "No geology data for this site" }), { available: false, reason: "No geology data for this site" });
  });
});
