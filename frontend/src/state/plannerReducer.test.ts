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
