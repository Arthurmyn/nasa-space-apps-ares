import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LonLat, ProfilePoint } from "../api/types.ts";
import { fractionToProfileDist, profileDistToFraction, slopeLines } from "./routeGeo.ts";

const limits = { cautionDeg: 8, maxDeg: 14 } as const;
const pt = (dist_m: number, slope_deg: number): ProfilePoint => ({ dist_m, elev_m: 0, slope_deg });
const profile = [pt(100, 1), pt(200, 2), pt(300, 12), pt(400, 12)];

describe("distance/fraction mapping", () => {
  it("maps profile distances to 0..1 and back", () => {
    assert.equal(profileDistToFraction(profile, 100), 0);
    assert.equal(profileDistToFraction(profile, 250), 0.5);
    assert.equal(profileDistToFraction(profile, 999), 1);
    assert.equal(fractionToProfileDist(profile, 0.5), 250);
  });
  it("returns 0 for an empty or single-sample profile", () => {
    assert.equal(profileDistToFraction([], 5), 0);
    assert.equal(profileDistToFraction([pt(0, 0)], 5), 0);
  });
});

describe("slopeLines", () => {
  const polyline: LonLat[] = [[0, 0], [0.003, 0]];

  it("cuts the polyline into runs matching the profile classes", () => {
    const lines = slopeLines(polyline, profile, limits);
    assert.deepEqual(lines.map((l) => l.cls), ["ok", "caution"]);
    // An interval takes the worse of its end slopes, so 200..300 m (2° then 12°) is already
    // "caution". The ok run is only 100..200 m: the first third, ending at lon 0.001.
    const end = lines[0]?.coordinates[lines[0].coordinates.length - 1];
    assert.ok(end && Math.abs(end[0] - 0.001) < 1e-9);
    // Runs join without a gap.
    assert.deepEqual(lines[0]?.coordinates.at(-1), lines[1]?.coordinates[0]);
  });
  it("returns nothing for a profile with fewer than two samples", () => {
    assert.deepEqual(slopeLines(polyline, [pt(0, 1)], limits), []);
  });
});
