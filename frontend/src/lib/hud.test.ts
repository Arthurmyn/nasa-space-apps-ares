import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LonLat, RouteResponse } from "../api/types.ts";
import { computeHud, normalizeDeg, relativeBearing, toHeadingFrame } from "./hud.ts";

const close = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const limits = { cautionDeg: 8, maxDeg: 14 } as const;

describe("angles", () => {
  it("normalizes to 0..360", () => {
    assert.equal(normalizeDeg(-90), 270);
    assert.equal(normalizeDeg(450), 90);
    assert.equal(normalizeDeg(360), 0);
  });
  it("gives the signed angle to a target, left negative", () => {
    assert.equal(relativeBearing(90, 0), 90);
    assert.equal(relativeBearing(270, 0), -90);
    assert.equal(relativeBearing(10, 350), 20);
    assert.equal(relativeBearing(350, 10), -20);
    assert.equal(relativeBearing(180, 0), -180);
  });
});

describe("toHeadingFrame", () => {
  const origin: LonLat = [10, 0];
  it("puts a point east of an east-facing position straight ahead", () => {
    const f = toHeadingFrame([10.001, 0], origin, 90);
    assert.ok(f.forward > 0);
    close(f.right, 0, 1e-6);
  });
  it("puts a point east of a north-facing position to the right", () => {
    const f = toHeadingFrame([10.001, 0], origin, 0);
    assert.ok(f.right > 0);
    close(f.forward, 0, 1e-6);
  });
  it("puts a point north of an east-facing position to the left", () => {
    const f = toHeadingFrame([10, 0.001], origin, 90);
    assert.ok(f.right < 0);
  });
});

// A straight eastward route of about 1.1 km with two stops and one hazard to the north.
const route: RouteResponse = {
  computed_at: "2030-01-01T00:00:00Z",
  distance_m: 1000,
  max_slope_deg: 12,
  est_time_s: 100,
  safety: "caution",
  safety_reason: "x",
  polyline: [[0, 0], [0.0169, 0]],
  stops: [
    { id: "stop-1", name: null, lon: 0.0085, lat: 0, dist_m: 500, note: null, image: null },
    { id: "stop-2", name: "Ridge", lon: 0.0169, lat: 0, dist_m: 1000, note: null, image: null },
  ],
  hazards: [
    {
      id: "h1",
      kind: "sand_trap",
      label: "Sand trap",
      polygon: { type: "Polygon", coordinates: [[[0.004, 0.003], [0.005, 0.003], [0.005, 0.004], [0.004, 0.003]]] },
    },
  ],
  profile: [
    { dist_m: 0, elev_m: 0, slope_deg: 2 },
    { dist_m: 500, elev_m: 10, slope_deg: 12 },
    { dist_m: 1000, elev_m: 0, slope_deg: 2 },
  ],
  assumptions: [],
  alternative: null,
};

describe("computeHud", () => {
  it("ignores tiny endpoint connectors when computing heading", () => {
    const connected = { ...route, polyline: [[0.00001, 0], [0, 0], [0, 0.001], [0.00001, 0.001]] as LonLat[] };
    close(relativeBearing(computeHud(connected, 0, limits)!.headingDeg, 0), 0, 3);
    close(relativeBearing(computeHud(connected, 1000, limits)!.headingDeg, 0), 0, 3);
  });

  it("heads east, finds the next stop and reports slope from the profile", () => {
    const hud = computeHud(route, 250, limits);
    assert.ok(hud);
    close(hud.headingDeg, 90, 0.01);
    assert.equal(hud.next?.label, "A");
    assert.equal(hud.next?.distM, 250);
    assert.equal(hud.destDistM, 750);
    close(hud.slopeDeg, 7, 1e-9);
    assert.equal(hud.slopeClass, "ok");
  });

  it("moves on to the following stop and names it", () => {
    const hud = computeHud(route, 700, limits);
    assert.equal(hud?.next?.label, "B");
    assert.equal(hud?.next?.name, "Ridge");
    assert.equal(hud?.next?.distM, 300);
  });

  it("has no next stop at the destination", () => {
    const hud = computeHud(route, 1000, limits);
    assert.equal(hud?.next, null);
    assert.equal(hud?.destDistM, 0);
  });

  it("lists hazards nearest first with a bearing", () => {
    const hud = computeHud(route, 0, limits);
    assert.equal(hud?.hazards.length, 1);
    const h = hud?.hazards[0];
    assert.ok(h && h.distM > 0 && h.bearingDeg > 0 && h.bearingDeg < 90, "north-east of the start");
  });

  it("classifies a steep position", () => {
    assert.equal(computeHud(route, 500, limits)?.slopeClass, "caution");
  });

  it("is null for a route without geometry or profile", () => {
    assert.equal(computeHud({ ...route, profile: [] }, 10, limits), null);
  });
});

describe("HUD heading at turns", () => {
  const makeRoute = (polyline: LonLat[]): RouteResponse => ({ ...route, polyline, distance_m: 200,
    profile: [{ dist_m: 0, elev_m: 0, slope_deg: 0 }, { dist_m: 200, elev_m: 0, slope_deg: 0 }] });

  it("keeps the incoming and outgoing directions at a sharp corner", () => {
    const corner = makeRoute([[0, 0], [0.001, 0], [0.001, 0.001]]);
    close(computeHud(corner, 95, limits)!.headingDeg, 90, 0.01);
    close(computeHud(corner, 100, limits)!.headingDeg, 0, 0.01);
    close(computeHud(corner, 105, limits)!.headingDeg, 0, 0.01);
  });

  it("changes direction at an out-and-back stop without looking across the turn", () => {
    const turnaround = makeRoute([[0, 0], [0.001, 0], [0, 0]]);
    close(computeHud(turnaround, 99, limits)!.headingDeg, 90, 0.01);
    close(computeHud(turnaround, 100, limits)!.headingDeg, 270, 0.01);
    close(computeHud(turnaround, 101, limits)!.headingDeg, 270, 0.01);
  });
});
