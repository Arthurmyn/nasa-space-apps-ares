import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RouteResponse } from "../api/types.ts";
import { exportFileName, routeToGeoJson } from "./exportGeoJson.ts";
import { evaShare, formatPct, slopeSegments, STATUS_TONE } from "./routeInsight.ts";

const route = {
  computed_at: "2026-11-15T05:45:00Z",
  distance_m: 1281.46,
  max_slope_deg: 13.04,
  est_time_s: 2306.8,
  safety: "caution",
  safety_reason: "x",
  polyline: [
    [137.38, -4.8],
    [137.381, -4.801],
    [137.382, -4.802],
  ],
  stops: [
    { id: "stop-1", name: "Ridge", lon: 137.381, lat: -4.801, dist_m: 600.04, note: "A note", image: null },
    { id: "stop-2", name: null, lon: 137.382, lat: -4.802, dist_m: 1281.46, note: null, image: null },
  ],
  hazards: [{ id: "h1", kind: "steep_slope", label: "Slope over 15 deg", polygon: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }],
  profile: [],
  assumptions: [],
  alternative: null,
  route_profile: "safe",
  status: "CAUTION",
  reasons: ["Steep."],
  round_trip_time_s: 4600,
  stats: { slope_class_pct: { ok: 70, caution: 30, avoid: 0 }, climb_m: 40.04, descent_m: 12 },
} as unknown as RouteResponse;

describe("routeToGeoJson", () => {
  const fc = routeToGeoJson(route, { siteId: "gale-bx", siteName: "Gale" });

  it("is a FeatureCollection with the route, the start, every stop and the hazards", () => {
    assert.equal(fc.type, "FeatureCollection");
    assert.deepEqual(fc.features.map((f) => (f.properties as { kind: string }).kind), ["route", "start", "stop", "stop", "hazard"]);
  });

  it("keeps [lon, lat] order and the whole polyline", () => {
    const line = fc.features[0]!;
    assert.equal(line.geometry.type, "LineString");
    assert.deepEqual((line.geometry as { coordinates: number[][] }).coordinates[0], [137.38, -4.8]);
    assert.equal((line.geometry as { coordinates: number[][] }).coordinates.length, 3);
  });

  it("carries the analysis fields when the route has them", () => {
    const p = fc.features[0]!.properties as Record<string, unknown>;
    assert.equal(p.status, "CAUTION");
    assert.equal(p.profile, "safe");
    assert.equal(p.round_trip_time_s, 4600);
    assert.equal(p.climb_m, 40);
    assert.deepEqual(p.reasons, ["Steep."]);
  });

  it("names stops, with a fallback label for an unnamed one", () => {
    const names = fc.features.filter((f) => (f.properties as { kind: string }).kind === "stop").map((f) => (f.properties as { name: string }).name);
    assert.deepEqual(names, ["Ridge", "Stop B"]);
  });

  it("states the coordinate system and is a pure function of the route", () => {
    assert.match((fc as unknown as { ares: { coordinates: string } }).ares.coordinates, /Mars sphere/);
    assert.equal(JSON.stringify(routeToGeoJson(route, { siteId: "gale-bx", siteName: "Gale" })), JSON.stringify(fc));
  });

  it("leaves the analysis fields out for an older route", () => {
    const old = { ...route, status: undefined, reasons: undefined, stats: undefined, round_trip_time_s: undefined, route_profile: undefined } as unknown as RouteResponse;
    const p = routeToGeoJson(old, { siteId: "a", siteName: "A" }).features[0]!.properties as Record<string, unknown>;
    for (const k of ["status", "reasons", "slope_class_pct", "round_trip_time_s", "profile"]) assert.equal(k in p, false, k);
  });
});

describe("exportFileName", () => {
  it("stamps the file with the compute time", () => {
    assert.equal(exportFileName("gale-bx", "2026-11-15T05:45:00Z"), "ares-route-gale-bx-20261115T054500Z.geojson");
  });
  it("copes with an unreadable time and an odd site id", () => {
    assert.equal(exportFileName("a/b c", "nope"), "ares-route-a_b_c.geojson");
  });
});

describe("routeInsight", () => {
  it("maps status to the three tones", () => {
    assert.deepEqual([STATUS_TONE.GO, STATUS_TONE.CAUTION, STATUS_TONE["NO-GO"]], ["ok", "caution", "avoid"]);
  });
  it("formats percentages", () => {
    assert.equal(formatPct(80), "80%");
    assert.equal(formatPct(0.44), "0.4%");
    assert.equal(formatPct(99.96), "100%");
    assert.equal(formatPct(Number.NaN), "–");
  });
  it("orders the slope classes and names their ranges", () => {
    const s = slopeSegments({ ok: 70, caution: 25, avoid: 5 }, 10, 15);
    assert.deepEqual(s.map((x) => [x.cls, x.pct, x.range]), [["ok", 70, "≤10°"], ["caution", 25, "10–15°"], ["avoid", 5, ">15°"]]);
  });
  it("computes the share of the EVA limit, or null without one", () => {
    assert.equal(evaShare(14400, 28800), 50);
    assert.equal(evaShare(null, 28800), null);
    assert.equal(evaShare(100, null), null);
    assert.equal(evaShare(100, 0), null);
  });
});
