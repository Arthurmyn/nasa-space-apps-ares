import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LonLat } from "../api/types.ts";
import { haversine } from "./geo.ts";
import { fitSketch } from "./sketch.ts";

const close = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

describe("fitSketch", () => {
  const pts: LonLat[] = [[0, 0], [0.02, 0.01]];

  it("keeps all points inside the padded box, north up", () => {
    const fit = fitSketch(pts, 200, 100, 10);
    assert.ok(fit);
    for (const p of pts) {
      const [x, y] = fit.project(p);
      assert.ok(x >= 10 - 1e-9 && x <= 190 + 1e-9, `x ${x}`);
      assert.ok(y >= 10 - 1e-9 && y <= 90 + 1e-9, `y ${y}`);
    }
    // Northern point has the smaller y.
    assert.ok(fit.project([0, 0.01])[1] < fit.project([0, 0])[1]);
  });

  it("reports a metres-per-unit that matches real ground distance", () => {
    const fit = fitSketch(pts, 200, 100, 10);
    assert.ok(fit);
    const a = fit.project(pts[0] as LonLat);
    const b = fit.project(pts[1] as LonLat);
    const units = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // Local flat approximation vs great circle: within 0.1% at this size.
    const truth = haversine(pts[0] as LonLat, pts[1] as LonLat);
    close((units * fit.metresPerUnit) / truth, 1, 0.001);
  });

  it("centres a single point instead of dividing by zero", () => {
    const fit = fitSketch([[5, 5]], 100, 60, 5);
    assert.ok(fit);
    const [x, y] = fit.project([5, 5]);
    close(x, 50, 1e-6);
    close(y, 30, 1e-6);
  });

  it("handles a perfectly horizontal line", () => {
    const fit = fitSketch([[0, 1], [0.01, 1]], 100, 60, 5);
    assert.ok(fit);
    const [x0] = fit.project([0, 1]);
    const [x1] = fit.project([0.01, 1]);
    assert.ok(x1 > x0);
  });

  it("returns null when there is nothing to draw or no room", () => {
    assert.equal(fitSketch([], 100, 100, 5), null);
    assert.equal(fitSketch([[0, 0]], 8, 100, 5), null);
  });
});
