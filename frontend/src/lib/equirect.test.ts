import assert from "node:assert/strict";
import test from "node:test";
import { equirectFootprint, mercatorRowToLat } from "./equirect.ts";

test("mercatorRowToLat is 0 at the map middle and symmetric", () => {
  assert.ok(Math.abs(mercatorRowToLat(1, 1)) < 1e-9);
  assert.ok(Math.abs(mercatorRowToLat(0.25, 2) + mercatorRowToLat(3.75, 2)) < 1e-9);
  assert.ok(Math.abs(mercatorRowToLat(0, 0) - 85.0511) < 1e-3);
});

test("zoom 0 reads both level-0 columns and the single row", () => {
  const f = equirectFootprint(0, 0, 0, 7);
  assert.equal(f.level, 0);
  assert.deepEqual([f.colMin, f.colMax, f.rowMin, f.rowMax], [0, 1, 0, 0]);
  assert.equal(f.width, 512);
});

test("columns line up with Mercator columns at level z-1", () => {
  const f = equirectFootprint(4, 9, 7, 7);
  assert.equal(f.level, 3);
  assert.equal(f.colMin, 9);
  assert.equal(f.colMax, 9);
  assert.ok(Math.abs(f.width - 256) < 1e-9);
  assert.ok(Math.abs(f.x0) < 1e-9);
});

test("rows around the equator stay within the tile rows of the source level", () => {
  // Gale crater, about 4.8 S, 137.4 E, at Mercator zoom 8 (source level 7).
  const z = 8;
  const x = Math.floor(((137.38 + 180) / 360) * 2 ** z);
  const y = Math.floor((1 - Math.asinh(Math.tan((-4.8 * Math.PI) / 180)) / Math.PI) * 2 ** (z - 1));
  const f = equirectFootprint(z, x, y, 7);
  assert.equal(f.level, 7);
  assert.ok(f.rowMin >= 65 && f.rowMin <= 67, `row ${f.rowMin}`);
  assert.equal(f.colMin, x);
  for (let i = 1; i < f.rowEdges.length; i += 1) assert.ok(f.rowEdges[i]! > f.rowEdges[i - 1]!);
});

test("zoom beyond the deepest level reuses level 7 and reads a sub-tile area", () => {
  const f = equirectFootprint(10, 800, 520, 7);
  assert.equal(f.level, 7);
  assert.ok(f.width < 256);
});
