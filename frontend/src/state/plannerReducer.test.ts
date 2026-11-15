import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RouteResponse } from "../api/types.ts";
import {
  buildRouteRequest,
  initialPlannerState,
  isStale,
  plannerReducer,
  routeView,
  type PlannerAction,
  type PlannerState,
} from "./plannerReducer.ts";

const run = (actions: PlannerAction[], from: PlannerState = initialPlannerState) =>
  actions.reduce(plannerReducer, from);

const fakeRoute = {} as RouteResponse;
const add = (n: number): PlannerAction => ({ type: "point/add", lon: n, lat: n });

describe("plannerReducer points", () => {
  it("first click sets the start, later clicks add stops, and selects the new point", () => {
    const s = run([add(1), add(2), add(3)]);
    assert.equal(s.start?.id, "start");
    assert.deepEqual(s.stops.map((p) => p.id), ["stop-1", "stop-2"]);
    assert.equal(s.selectedId, "stop-2");
  });

  it("caps stops at 5 and sets a notice instead of adding", () => {
    const s = run([add(0), ...[1, 2, 3, 4, 5, 6].map(add)]);
    assert.equal(s.stops.length, 5);
    assert.match(s.notice ?? "", /Maximum of 5/);
  });

  it("never reuses a stop id after removal", () => {
    const s = run([add(0), add(1), add(2), { type: "point/remove", id: "stop-1" }, add(3)]);
    assert.deepEqual(s.stops.map((p) => p.id), ["stop-2", "stop-3"]);
  });

  it("moves a stop and ignores unknown ids without bumping the version", () => {
    const s = run([add(0), add(1), { type: "point/move", id: "stop-1", lon: 9, lat: 8 }]);
    assert.deepEqual([s.stops[0]?.lon, s.stops[0]?.lat], [9, 8]);
    const v = s.planVersion;
    assert.equal(plannerReducer(s, { type: "point/move", id: "nope", lon: 0, lat: 0 }).planVersion, v);
  });

  it("clears selection when the selected point is removed", () => {
    const s = run([add(0), add(1), { type: "point/remove", id: "stop-1" }]);
    assert.equal(s.selectedId, null);
  });
});

describe("plannerReducer route lifecycle", () => {
  it("is empty until there is a start and a stop, then loading until a route arrives", () => {
    assert.equal(routeView(run([add(0)])), "empty");
    assert.equal(routeView(run([add(0), add(1)])), "loading");
  });

  it("success makes the route current; an edit then makes it stale but keeps it", () => {
    let s = run([add(0), add(1)]);
    s = run([{ type: "route/loading" }], s);
    assert.equal(routeView(s), "loading");
    s = run([{ type: "route/success", route: fakeRoute, version: s.planVersion }], s);
    assert.equal(routeView(s), "success");
    s = run([add(2)], s);
    assert.equal(routeView(s), "stale");
    assert.equal(s.route, fakeRoute);
    assert.ok(isStale(s));
  });

  it("a late response for an older plan version stays stale", () => {
    let s = run([add(0), add(1)]);
    const old = s.planVersion;
    s = run([add(2)], s);
    s = run([{ type: "route/success", route: fakeRoute, version: old }], s);
    assert.equal(routeView(s), "stale");
  });

  it("dropping below start+1 stop removes the route", () => {
    let s = run([add(0), add(1)]);
    s = run([{ type: "route/success", route: fakeRoute, version: s.planVersion }], s);
    s = run([{ type: "point/remove", id: "stop-1" }], s);
    assert.equal(s.route, null);
    assert.equal(routeView(s), "empty");
  });

  it("failure shows the error view and an edit clears it", () => {
    let s = run([add(0), add(1), { type: "route/failure", message: "boom" }]);
    assert.equal(routeView(s), "error");
    s = run([add(2)], s);
    assert.equal(s.error, null);
    assert.equal(routeView(s), "loading");
  });
});

describe("buildRouteRequest", () => {
  it("is null until there is a start and a stop", () => {
    assert.equal(buildRouteRequest(run([add(0)])), null);
  });
  it("lists points in order and only sets compare when on", () => {
    const s = run([add(0), add(1), add(2)]);
    const req = buildRouteRequest(s);
    assert.equal(req?.start.id, "start");
    assert.deepEqual(req?.stops.map((p) => p.id), ["stop-1", "stop-2"]);
    assert.equal(req && "compare" in req, false);
    const withCompare = buildRouteRequest(run([{ type: "compare/set", value: true }], s));
    assert.equal(withCompare?.compare, true);
  });
});

describe("plannerReducer stops/preset", () => {
  const preset = (n: number): PlannerAction => ({
    type: "stops/preset",
    stops: Array.from({ length: n }, (_, i) => ({ lon: i, lat: i, name: `Target ${i + 1}` })),
  });

  it("places the targets as named stops and keeps the start", () => {
    const s = run([add(1), preset(3)]);
    assert.equal(s.start?.id, "start");
    assert.equal(s.stops.length, 3);
    assert.equal(s.notice, null);
  });

  it("with a start, visits the nearest target first instead of the list order", () => {
    // Start at (1, 1); the targets are (0, 0), (1, 1) and (2, 2). The one under the start is first.
    const s = run([add(1), preset(3)]);
    assert.equal(s.stops[0]?.name, "Target 2");
    assert.equal(s.stops.length, 3);
  });

  it("without a start, keeps the list order", () => {
    const s = run([preset(3)]);
    assert.deepEqual(s.stops.map((p) => p.name), ["Target 1", "Target 2", "Target 3"]);
  });

  it("keeps the science note of a target before any route exists", () => {
    const s = run([{ type: "stops/preset", stops: [{ lon: 0, lat: 0, name: "T", note: "Look at the ridge" }] }]);
    assert.equal(s.stops[0]?.note, "Look at the ridge");
  });

  it("replaces earlier stops instead of appending", () => {
    const s = run([add(1), add(2), add(3), preset(2)]);
    assert.equal(s.stops.length, 2);
    assert.deepEqual(s.stops.map((p) => p.id), ["stop-3", "stop-4"]);
  });

  it("uses at most MAX_STOPS targets and says so", () => {
    const s = run([preset(8)]);
    assert.equal(s.stops.length, 5);
    assert.match(s.notice ?? "", /first 5 of 8/);
  });

  it("without a start there is no route request yet; clicking a start makes one", () => {
    const placed = run([preset(2)]);
    assert.equal(buildRouteRequest(placed), null);
    const req = buildRouteRequest(run([add(9)], placed));
    assert.equal(req?.stops.length, 2);
    assert.equal(req?.stops[0]?.name, "Target 1");
  });
});

describe("plannerReducer plan/load and notice/set", () => {
  it("restores a start and stops with fresh ids and asks for a route", () => {
    const s = run([{ type: "plan/load", start: { lon: 1, lat: 1 }, stops: [{ lon: 2, lat: 2 }, { lon: 3, lat: 3 }] }]);
    assert.equal(s.start?.id, "start");
    assert.deepEqual(s.stops.map((p) => p.id), ["stop-1", "stop-2"]);
    assert.equal(s.nextStopNo, 3);
    assert.ok(s.planVersion > 0);
  });

  it("notice/set shows a message", () => {
    assert.equal(run([{ type: "notice/set", message: "Outside the grid" }]).notice, "Outside the grid");
  });
});

describe("buildRouteRequest and the site", () => {
  it("names the site so the backend plans on its terrain", () => {
    const s = run([add(1), add(2)]);
    assert.equal(buildRouteRequest(s, "gale-001488")?.site_id, "gale-001488");
  });

  it("leaves site_id out when none is given (the backend default applies)", () => {
    const s = run([add(1), add(2)]);
    assert.equal("site_id" in (buildRouteRequest(s) ?? {}), false);
  });
});

describe("route profile", () => {
  const placed = run([add(0), add(1)]);

  it("is balanced by default and then left out of the request", () => {
    assert.equal(placed.profile, "balanced");
    assert.equal("profile" in (buildRouteRequest(placed) ?? {}), false);
  });

  it("is sent when it is not balanced", () => {
    assert.equal(buildRouteRequest(run([{ type: "profile/set", profile: "safe" }], placed))?.profile, "safe");
  });

  it("makes the current route out of date, so it is recomputed", () => {
    const withRoute = run([{ type: "route/success", route: fakeRoute, version: placed.planVersion }], placed);
    assert.equal(isStale(withRoute), false);
    const changed = run([{ type: "profile/set", profile: "fast" }], withRoute);
    assert.equal(isStale(changed), true);
    assert.equal(changed.route, fakeRoute, "the old route stays on screen until the new one arrives");
  });

  it("does nothing when the same profile is chosen again", () => {
    assert.equal(plannerReducer(placed, { type: "profile/set", profile: "balanced" }), placed);
  });

  it("survives Clear", () => {
    assert.equal(run([{ type: "profile/set", profile: "safe" }, { type: "reset" }], placed).profile, "safe");
  });
});
