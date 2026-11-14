import assert from "node:assert/strict";
import test from "node:test";
import { imageCorners, zoomForBbox } from "./siteGeo.ts";

const bbox = { lon_min: 137.3774, lon_max: 137.3881, lat_min: -4.8104, lat_max: -4.7959 };

test("imageCorners goes NW, NE, SE, SW", () => {
  assert.deepEqual(imageCorners(bbox), [
    [137.3774, -4.7959],
    [137.3881, -4.7959],
    [137.3881, -4.8104],
    [137.3774, -4.8104],
  ]);
});

test("zoomForBbox: a box about 1 km wide opens near zoom 16", () => {
  const z = zoomForBbox(bbox);
  assert.ok(z > 15 && z < 17, `zoom ${z}`);
});

test("zoomForBbox: a wider box gives a lower zoom", () => {
  const wide = { ...bbox, lon_min: bbox.lon_min - 0.05 };
  assert.ok(zoomForBbox(wide) < zoomForBbox(bbox));
});
