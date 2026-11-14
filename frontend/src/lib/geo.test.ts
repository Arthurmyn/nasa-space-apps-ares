import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LonLat } from "../api/types.ts";
import {
  MARS_RADIUS_M,
  bearing,
  boundsOf,
  computeScaleBar,
  cumulativeLengths,
  decimalsForStep,
  gridLines,
  haversine,
  metresPerPixel,
  niceNumber,
  offsetLonLat,
  pointAtFraction,
  projectOnPath,
  ringCentroid,
  slicePath,
} from "./geo.ts";

const close = (actual: number, expected: number, tol: number) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} not within ${tol} of ${expected}`);

describe("haversine", () => {
  it("measures one degree of latitude on Mars", () => {
    close(haversine([0, 0], [0, 1]), (MARS_RADIUS_M * Math.PI) / 180, 1);
  });
  it("is zero for identical points", () => {
    assert.equal(haversine([10, 20], [10, 20]), 0);
  });
});

describe("bearing", () => {
  it("points north, east, south, west", () => {
    close(bearing([0, 0], [0, 1]), 0, 1e-9);
    close(bearing([0, 0], [1, 0]), 90, 1e-9);
    close(bearing([0, 0], [0, -1]), 180, 1e-9);
    close(bearing([0, 0], [-1, 0]), 270, 1e-9);
  });
});

describe("offsetLonLat", () => {
  it("round-trips with haversine at small distances", () => {
    const start: LonLat = [77.5, 18.4];
    const moved = offsetLonLat(start, 300, 400);
    close(haversine(start, moved), 500, 1);
  });
  it("does not produce NaN at the pole", () => {
    const moved = offsetLonLat([0, 90], 100, 0);
    assert.ok(Number.isFinite(moved[0]));
  });
});

describe("metresPerPixel and scale bar", () => {
  it("halves with each zoom level", () => {
    close(metresPerPixel(0, 11) / metresPerPixel(0, 12), 2, 1e-9);
  });
  it("shrinks with latitude", () => {
    assert.ok(metresPerPixel(60, 10) < metresPerPixel(0, 10));
  });
  it("niceNumber rounds down to 1, 2, 5", () => {
    assert.equal(niceNumber(7), 5);
    assert.equal(niceNumber(30), 20);
    assert.equal(niceNumber(130), 100);
    assert.equal(niceNumber(0.3), 0.2);
    assert.equal(niceNumber(0), 0);
  });
  it("fits the bar inside the max width and labels it", () => {
    const bar = computeScaleBar(2.5, 100);
    assert.ok(bar);
    assert.equal(bar.metres, 200);
    assert.equal(bar.label, "200 m");
    assert.ok(bar.widthPx <= 100);
    const km = computeScaleBar(20, 100);
    assert.equal(km?.label, "2 km");
  });
  it("returns null for invalid input", () => {
    assert.equal(computeScaleBar(0, 100), null);
    assert.equal(computeScaleBar(2, 0), null);
  });
});

describe("boundsOf and gridLines", () => {
  it("computes bounds", () => {
    assert.deepEqual(boundsOf([[1, 2], [3, -4], [-5, 6]]), { west: -5, south: -4, east: 3, north: 6 });
    assert.equal(boundsOf([]), null);
  });
  it("lists grid lines on multiples of the step inside bounds", () => {
    const g = gridLines({ west: 0.15, south: -0.25, east: 0.55, north: 0.25 }, 0.1);
    assert.deepEqual(g.lons.map((v) => Math.round(v * 10)), [2, 3, 4, 5]);
    assert.deepEqual(g.lats.map((v) => Math.round(v * 10)), [-2, -1, 0, 1, 2]);
  });
  it("refuses to draw an absurd number of lines", () => {
    const g = gridLines({ west: 0, south: 0, east: 1000, north: 1 }, 0.1);
    assert.deepEqual(g.lons, []);
  });
});

describe("decimalsForStep", () => {
  it("adds precision as the grid gets finer", () => {
    assert.equal(decimalsForStep(1), 2);
    assert.equal(decimalsForStep(0.0084), 4);
    assert.equal(decimalsForStep(0.00001), 6);
    assert.equal(decimalsForStep(0), 2);
  });
});

describe("path helpers", () => {
  const path: LonLat[] = [[0, 0], [0.01, 0], [0.01, 0.01]];

  it("accumulates length", () => {
    const l = cumulativeLengths(path);
    assert.equal(l.length, 3);
    close((l[2] ?? 0) - (l[1] ?? 0), haversine(path[1] as LonLat, path[2] as LonLat), 1e-6);
  });
  it("finds the point at half the length", () => {
    const r = pointAtFraction(path, 0.5);
    assert.ok(r);
    close(r.point[0], 0.01, 1e-6);
    close(r.point[1], 0, 1e-6);
  });
  it("clamps fractions and handles empty paths", () => {
    assert.deepEqual(pointAtFraction(path, 5)?.point, [0.01, 0.01]);
    assert.equal(pointAtFraction([], 0.5), null);
  });
  it("projects a point onto the nearest segment", () => {
    const r = projectOnPath(path, [0.005, 0.001]);
    assert.ok(r);
    close(r.point[0], 0.005, 1e-6);
    close(r.point[1], 0, 1e-6);
    assert.ok(r.offsetM > 0);
    close(r.fraction, 0.25, 0.01);
  });
});

describe("slicePath", () => {
  const path: LonLat[] = [[0, 0], [0.01, 0], [0.01, 0.01]];

  it("returns the whole path for 0..1", () => {
    assert.deepEqual(slicePath(path, 0, 1), path);
  });
  it("cuts inside a segment and keeps interior vertices", () => {
    const s = slicePath(path, 0.25, 0.75);
    assert.equal(s.length, 3);
    close(s[0]?.[0] ?? NaN, 0.005, 1e-6);
    assert.deepEqual(s[1], [0.01, 0]);
    close(s[2]?.[1] ?? NaN, 0.005, 1e-6);
  });
  it("accepts reversed fractions and clamps", () => {
    assert.deepEqual(slicePath(path, 2, -1), path);
  });
  it("handles degenerate paths", () => {
    assert.deepEqual(slicePath([], 0, 1), []);
    assert.deepEqual(slicePath([[1, 2]], 0, 1), [[1, 2]]);
  });
});

describe("ringCentroid", () => {
  it("ignores the closing vertex", () => {
    const c = ringCentroid([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]);
    assert.deepEqual(c, [1, 1]);
  });
  it("is null for an empty ring", () => {
    assert.equal(ringCentroid([]), null);
  });
});
