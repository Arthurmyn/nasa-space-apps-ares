import assert from "node:assert/strict";
import test from "node:test";
import { boundsOfBbox, checkStopPoint, clampToBbox, gridCellIndex, imageCorners, insideBbox } from "./siteGeo.ts";

const bbox = { lon_min: 137.3774, lon_max: 137.3881, lat_min: -4.8104, lat_max: -4.7959 };

test("imageCorners goes NW, NE, SE, SW", () => {
  assert.deepEqual(imageCorners(bbox), [
    [137.3774, -4.7959],
    [137.3881, -4.7959],
    [137.3881, -4.8104],
    [137.3774, -4.8104],
  ]);
});

test("boundsOfBbox is [[west, south], [east, north]]", () => {
  assert.deepEqual(boundsOfBbox(bbox), [
    [137.3774, -4.8104],
    [137.3881, -4.7959],
  ]);
});

test("insideBbox includes the edges and excludes outside points", () => {
  assert.equal(insideBbox(bbox, 137.38, -4.8), true);
  assert.equal(insideBbox(bbox, 137.3774, -4.7959), true);
  assert.equal(insideBbox(bbox, 137.39, -4.8), false);
  assert.equal(insideBbox(bbox, 137.38, -4.79), false);
});

test("clampToBbox moves an outside point onto the nearest edge", () => {
  assert.deepEqual(clampToBbox(bbox, 137.4, -4.8), [137.3881, -4.8]);
  assert.deepEqual(clampToBbox(bbox, 137.38, -4.9), [137.38, -4.8104]);
  assert.deepEqual(clampToBbox(bbox, 137.38, -4.8), [137.38, -4.8]);
});

test("gridCellIndex follows the contract formulas and rejects points off the grid", () => {
  const g = { width: 4, height: 3, cell_m: 10, x_min_m: -20, y_max_m: 15, mars_radius_m: 3396190, slope_unit_deg: 0.5, slope_nodata: 255 };
  const centre = { lon: 137.38, lat: -4.8 };
  const mPerDegLat = (3396190 * Math.PI) / 180;
  const mPerDegLon = mPerDegLat * Math.cos((-4.8 * Math.PI) / 180);
  // Centre of the cell at row 1, col 2: x = -20 + 25 = 5 m, y = 15 - 15 = 0 m.
  assert.equal(gridCellIndex(g, centre, 137.38 + 5 / mPerDegLon, -4.8), 1 * 4 + 2);
  assert.equal(gridCellIndex(g, centre, 137.38 - 25 / mPerDegLon, -4.8), null);
  assert.equal(gridCellIndex(g, centre, 137.38, -4.8 + 20 / mPerDegLat), null);
});

test("checkStopPoint blocks DTM gaps and cells over the slope limit", () => {
  const g = { width: 2, height: 1, cell_m: 10, x_min_m: -10, y_max_m: 5, mars_radius_m: 3396190, slope_unit_deg: 0.5, slope_nodata: 255 };
  const centre = { lon: 137.38, lat: -4.8 };
  const m = (3396190 * Math.PI) / 180 * Math.cos((-4.8 * Math.PI) / 180);
  const west = 137.38 - 5 / m;
  const east = 137.38 + 5 / m;
  assert.deepEqual(checkStopPoint(g, centre, Uint8Array.from([20, 255]), 15, west, -4.8), { ok: true }); // 10 deg
  assert.equal(checkStopPoint(g, centre, Uint8Array.from([20, 255]), 15, east, -4.8).ok, false);
  const gap = checkStopPoint(g, centre, Uint8Array.from([20, 255]), 15, east, -4.8);
  assert.ok(!gap.ok && gap.reason === "nodata");
  const steep = checkStopPoint(g, centre, Uint8Array.from([31, 0]), 15, west, -4.8); // 15.5 deg
  assert.ok(!steep.ok && steep.reason === "steep");
  assert.equal(checkStopPoint(g, centre, Uint8Array.from([30, 0]), 15, west, -4.8).ok, true); // exactly 15 deg
});
