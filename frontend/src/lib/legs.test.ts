import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProfilePoint } from "../api/types.ts";
import { routeLegs } from "./legs.ts";

const limits = { cautionDeg: 8, maxDeg: 14 } as const;
const pt = (dist_m: number, elev_m: number, slope_deg: number): ProfilePoint => ({ dist_m, elev_m, slope_deg });
const profile = [pt(0, 0, 1), pt(100, 5, 3), pt(200, 15, 12), pt(300, 15, 2)];

describe("routeLegs", () => {
  it("builds one leg per consecutive waypoint pair with class from the steepest point", () => {
    const legs = routeLegs(
      profile,
      [
        { label: "S", distM: 0 },
        { label: "A", distM: 100 },
        { label: "B", distM: 300 },
      ],
      limits,
    );
    assert.equal(legs.length, 2);
    assert.deepEqual([legs[0]?.fromLabel, legs[0]?.toLabel, legs[0]?.cls], ["S", "A", "ok"]);
    assert.deepEqual([legs[1]?.fromLabel, legs[1]?.toLabel, legs[1]?.cls], ["A", "B", "caution"]);
    assert.equal(legs[1]?.stats.lengthM, 200);
    assert.equal(legs[1]?.stats.elevGainM, 10);
  });

  it("skips zero-length and reversed legs", () => {
    const legs = routeLegs(
      profile,
      [
        { label: "S", distM: 0 },
        { label: "A", distM: 100 },
        { label: "B", distM: 100 },
        { label: "C", distM: 50 },
      ],
      limits,
    );
    assert.deepEqual(legs.map((l) => l.toLabel), ["A"]);
  });

  it("returns nothing for fewer than two waypoints", () => {
    assert.deepEqual(routeLegs(profile, [{ label: "S", distM: 0 }], limits), []);
  });
});
