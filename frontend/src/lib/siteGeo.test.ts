import assert from "node:assert/strict";
import test from "node:test";
import { boundsOfBbox, imageCorners } from "./siteGeo.ts";

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
