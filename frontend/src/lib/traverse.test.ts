import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTraverse, slopeAt, traverseTooltip } from "./traverse.ts";

const point = (lon: number, lat: number, props: Record<string, unknown>) => ({
  type: "Feature",
  properties: props,
  geometry: { type: "Point", coordinates: [lon, lat] },
});

describe("parseTraverse", () => {
  it("orders stops by sol, then site, then drive", () => {
    const stops = parseTraverse({
      type: "FeatureCollection",
      features: [
        point(3, 0, { sol: 4540, site: 116, drive: 10, tilt: 5 }),
        point(2, 0, { sol: 4537, site: 117, drive: 0, tilt: 4 }),
        point(1, 0, { sol: 4537, site: 116, drive: 400, tilt: 3 }),
        point(0, 0, { sol: 4537, site: 116, drive: 156, tilt: 2 }),
      ],
    });
    assert.deepEqual(
      stops.map((s) => [s.sol, s.site, s.drive]),
      [
        [4537, 116, 156],
        [4537, 116, 400],
        [4537, 117, 0],
        [4540, 116, 10],
      ],
    );
    assert.deepEqual(
      stops.map((s) => s.lon),
      [0, 1, 2, 3],
    );
  });

  it("skips features without a point or an id, and keeps a missing tilt as null", () => {
    const stops = parseTraverse({
      features: [
        point(1, 1, { sol: 1, site: 1 }),
        { type: "Feature", properties: { sol: 2, site: 1, drive: 0 }, geometry: { type: "LineString", coordinates: [] } },
        point(2, 2, { sol: 3, site: 1, drive: 0 }),
      ],
    });
    assert.equal(stops.length, 1);
    assert.equal(stops[0]?.tilt, null);
  });

  it("returns no stops for something that is not a FeatureCollection", () => {
    assert.deepEqual(parseTraverse(null), []);
    assert.deepEqual(parseTraverse("<!doctype html>"), []);
  });
});

describe("slopeAt", () => {
  // 2 x 2 grid of 10 m cells centred on (0, 0); radius chosen so 1 degree is 1000 m.
  const R = 180_000 / Math.PI;
  const grid = { width: 2, height: 2, cell_m: 10, x_min_m: -10, y_max_m: 10, mars_radius_m: R, slope_unit_deg: 0.5, slope_nodata: 255 };
  const centre = { lon: 0, lat: 0 };
  // Row-major, north row first: NW, NE, SW, SE.
  const slope = new Uint8Array([12, 20, 255, 0]);

  it("reads byte times slope_unit_deg from the cell under the point", () => {
    assert.equal(slopeAt(grid, centre, slope, -0.005, 0.005), 6);
    assert.equal(slopeAt(grid, centre, slope, 0.005, 0.005), 10);
    assert.equal(slopeAt(grid, centre, slope, 0.005, -0.005), 0);
  });

  it("is null on a no-data cell, outside the grid or without slope.bin", () => {
    assert.equal(slopeAt(grid, centre, slope, -0.005, -0.005), null);
    assert.equal(slopeAt(grid, centre, slope, 0.05, 0), null);
    assert.equal(slopeAt(grid, centre, null, 0.005, 0.005), null);
  });
});

describe("traverseTooltip", () => {
  it("formats sol, rover tilt and our slope", () => {
    assert.equal(traverseTooltip({ sol: 4612, tilt: 9 }, 6), "Sol 4612 · rover tilt 9.0° · slope here 6.0°");
  });
  it("says when a value is missing", () => {
    assert.equal(traverseTooltip({ sol: 1, tilt: null }, null), "Sol 1 · rover tilt n/a · slope here no data");
  });
});
