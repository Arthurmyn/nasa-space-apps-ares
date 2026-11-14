import assert from "node:assert/strict";
import test from "node:test";
import { boundsOfBbox, clampToBbox, imageCorners, insideBbox } from "./siteGeo.ts";

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
