import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProfilePoint } from "../api/types.ts";
import {
  downsampleProfile,
  interpolateProfile,
  profileExtent,
  sectionStats,
  segmentsByClass,
} from "./profile.ts";

const limits = { cautionDeg: 8, maxDeg: 14 } as const;
const pt = (dist_m: number, elev_m: number, slope_deg: number): ProfilePoint => ({ dist_m, elev_m, slope_deg });

describe("interpolateProfile", () => {
  const profile = [pt(0, 100, 0), pt(100, 120, 10), pt(300, 100, 4)];

  it("interpolates linearly between samples", () => {
    const p = interpolateProfile(profile, 50);
    assert.ok(p);
    assert.equal(p.elev_m, 110);
    assert.equal(p.slope_deg, 5);
  });
  it("clamps outside the range", () => {
    assert.equal(interpolateProfile(profile, -10)?.elev_m, 100);
    assert.equal(interpolateProfile(profile, 999)?.dist_m, 300);
  });
  it("returns null for an empty profile", () => {
    assert.equal(interpolateProfile([], 5), null);
  });
  it("hits exact sample distances", () => {
    assert.equal(interpolateProfile(profile, 100)?.elev_m, 120);
  });
});

describe("segmentsByClass", () => {
  it("merges neighbours of the same class and splits on change", () => {
    const profile = [pt(0, 0, 1), pt(10, 0, 2), pt(20, 0, 3), pt(30, 0, 10), pt(40, 0, 11), pt(50, 0, 20)];
    const segs = segmentsByClass(profile, limits);
    assert.deepEqual(segs, [
      { cls: "ok", from: 0, to: 2 },
      { cls: "caution", from: 2, to: 4 },
      { cls: "avoid", from: 4, to: 5 },
    ]);
  });
  it("lets a steep end sample colour the whole interval", () => {
    const segs = segmentsByClass([pt(0, 0, 1), pt(10, 0, 15)], limits);
    assert.deepEqual(segs, [{ cls: "avoid", from: 0, to: 1 }]);
  });
  it("returns nothing for fewer than two samples", () => {
    assert.deepEqual(segmentsByClass([pt(0, 0, 0)], limits), []);
  });
});

describe("downsampleProfile", () => {
  const long = Array.from({ length: 1000 }, (_, i) => pt(i * 5, i, i === 437 ? 20 : 1));

  it("keeps the result near the requested size and the endpoints", () => {
    const out = downsampleProfile(long, 100);
    assert.ok(out.length <= 100);
    assert.equal(out[0]?.dist_m, 0);
    assert.equal(out[out.length - 1]?.dist_m, 999 * 5);
  });
  it("keeps the steepest sample", () => {
    const out = downsampleProfile(long, 100);
    assert.ok(out.some((p) => p.slope_deg === 20));
  });
  it("keeps distances strictly increasing", () => {
    const out = downsampleProfile(long, 100);
    for (let i = 1; i < out.length; i += 1) {
      assert.ok((out[i]?.dist_m ?? 0) > (out[i - 1]?.dist_m ?? 0));
    }
  });
  it("returns a copy when already small", () => {
    const small = [pt(0, 0, 0), pt(1, 0, 0)];
    const out = downsampleProfile(small, 100);
    assert.deepEqual(out, small);
    assert.notEqual(out, small);
  });
});

describe("profileExtent", () => {
  it("reports min, max and total distance", () => {
    assert.deepEqual(profileExtent([pt(10, 5, 0), pt(60, 50, 0), pt(110, 20, 0)]), {
      minElev: 5,
      maxElev: 50,
      totalDist: 100,
    });
  });
  it("is null when empty", () => {
    assert.equal(profileExtent([]), null);
  });
});

describe("sectionStats", () => {
  const profile = [pt(0, 0, 2), pt(100, 10, 6), pt(200, 0, 10)];

  it("computes length, max slope and elevation change for a span", () => {
    const s = sectionStats(profile, 0, 200);
    assert.ok(s);
    assert.equal(s.lengthM, 200);
    assert.equal(s.maxSlopeDeg, 10);
    assert.equal(s.elevGainM, 10);
    assert.equal(s.elevLossM, 10);
    assert.equal(s.meanSlopeDeg, 6);
  });
  it("clips to the requested span", () => {
    const s = sectionStats(profile, 50, 100);
    assert.ok(s);
    assert.equal(s.lengthM, 50);
    assert.equal(s.maxSlopeDeg, 6);
  });
  it("is null for an empty or reversed span", () => {
    assert.equal(sectionStats(profile, 100, 100), null);
    assert.equal(sectionStats(profile, 150, 100), null);
    assert.equal(sectionStats([], 0, 10), null);
  });
});
