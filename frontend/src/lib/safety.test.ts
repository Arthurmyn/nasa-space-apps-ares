import assert from "node:assert/strict";
import test from "node:test";
import { routeSpeedMps, safetyMargins, walkBackTimeS } from "./safety.ts";

// 0.001 degrees of latitude is about 59 m on Mars.
const north = (lat: number): [number, number] => [0, lat];

test("safetyMargins finds the farthest point in a straight line and along the path", () => {
  // Out to 0.002, then back to 0.001: the farthest point is the turn, the path there is the first leg.
  const m = safetyMargins([north(0), north(0.002), north(0.001)]);
  assert.ok(m);
  assert.ok(Math.abs(m.farthestM - m.alongRouteM) < 1e-6);
  assert.ok(m.farthestM > 100 && m.farthestM < 130);
});

test("a path that wanders is longer along the route than in a straight line", () => {
  const m = safetyMargins([north(0), [0.002, 0], [0.002, 0.002]]);
  assert.ok(m);
  assert.ok(m.alongRouteM > m.farthestM);
});

test("safetyMargins of an empty path is null", () => {
  assert.equal(safetyMargins([]), null);
});

test("routeSpeedMps and walkBackTimeS", () => {
  assert.equal(routeSpeedMps(1000, 1800), 1000 / 1800);
  assert.equal(routeSpeedMps(1000, 0), null);
  assert.equal(walkBackTimeS({ farthestM: 500, alongRouteM: 600 }, 0.5), 1200);
  assert.equal(walkBackTimeS({ farthestM: 500, alongRouteM: 600 }, null), null);
});
