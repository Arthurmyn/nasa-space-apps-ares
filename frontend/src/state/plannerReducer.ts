import type { RouteRequest, RouteResponse } from "../api/types.ts";
import { MAX_STOPS, SLOPE_LIMITS } from "../config/route.ts";

export interface PlanPoint {
  /** "start" or "stop-<n>"; stable for the life of the point. */
  id: string;
  lon: number;
  lat: number;
  /** Name of a preset target, sent to the API and shown instead of "Stop A". */
  name?: string;
}

export interface PresetStop {
  lon: number;
  lat: number;
  name: string;
}

export type RouteStatus = "idle" | "loading" | "ready" | "error";

export interface PlannerState {
  start: PlanPoint | null;
  stops: PlanPoint[];
  nextStopNo: number;
  /** Incremented on every edit to the points. */
  planVersion: number;
  route: RouteResponse | null;
  /** The planVersion the current `route` was computed for. */
  routeVersion: number | null;
  status: RouteStatus;
  error: string | null;
  selectedId: string | null;
  compare: boolean;
  /** Short message for the live region, for example "Maximum of 5 stops reached". */
  notice: string | null;
}

export type PlannerAction =
  | { type: "point/add"; lon: number; lat: number }
  | { type: "point/move"; id: string; lon: number; lat: number }
  | { type: "point/remove"; id: string }
  | { type: "stops/preset"; stops: readonly PresetStop[] }
  | { type: "select"; id: string | null }
  | { type: "compare/set"; value: boolean }
  | { type: "route/loading" }
  | { type: "route/success"; route: RouteResponse; version: number }
  | { type: "route/failure"; message: string }
  | { type: "notice/clear" }
  | { type: "reset" };

export const initialPlannerState: PlannerState = {
  start: null,
  stops: [],
  nextStopNo: 1,
  planVersion: 0,
  route: null,
  routeVersion: null,
  status: "idle",
  error: null,
  selectedId: null,
  compare: false,
  notice: null,
};

export const isRoutable = (s: Pick<PlannerState, "start" | "stops">): boolean =>
  s.start !== null && s.stops.length >= 1;

/** True when the points were edited after the current route was computed. */
export const isStale = (s: PlannerState): boolean => s.route !== null && s.routeVersion !== s.planVersion;

export type RouteView = "empty" | "loading" | "success" | "stale" | "error";

export function routeView(s: PlannerState): RouteView {
  if (s.status === "error") return "error";
  // With a start and a stop but no route yet, a request is in flight or about to be (debounce).
  if (!s.route) return s.status === "loading" || isRoutable(s) ? "loading" : "empty";
  return isStale(s) ? "stale" : "success";
}

/** Apply an edit to the points: bump the version and drop the route if it can no longer exist. */
function edited(s: PlannerState, patch: Partial<PlannerState>): PlannerState {
  const next: PlannerState = { ...s, ...patch, planVersion: s.planVersion + 1, error: null, notice: null };
  if (!isRoutable(next)) {
    return { ...next, route: null, routeVersion: null, status: "idle" };
  }
  return { ...next, status: next.route ? "ready" : "idle" };
}

export function plannerReducer(s: PlannerState, a: PlannerAction): PlannerState {
  switch (a.type) {
    case "point/add": {
      if (!s.start) {
        const start: PlanPoint = { id: "start", lon: a.lon, lat: a.lat };
        return edited(s, { start, selectedId: start.id });
      }
      if (s.stops.length >= MAX_STOPS) {
        return { ...s, notice: `Maximum of ${MAX_STOPS} stops reached. Move or remove a stop.` };
      }
      const stop: PlanPoint = { id: `stop-${s.nextStopNo}`, lon: a.lon, lat: a.lat };
      return edited(s, { stops: [...s.stops, stop], nextStopNo: s.nextStopNo + 1, selectedId: stop.id });
    }
    case "point/move": {
      const move = (p: PlanPoint): PlanPoint => (p.id === a.id ? { ...p, lon: a.lon, lat: a.lat } : p);
      if (s.start?.id === a.id) return edited(s, { start: move(s.start) });
      if (!s.stops.some((p) => p.id === a.id)) return s;
      return edited(s, { stops: s.stops.map(move) });
    }
    case "point/remove": {
      const selectedId = s.selectedId === a.id ? null : s.selectedId;
      if (s.start?.id === a.id) return edited(s, { start: null, selectedId });
      if (!s.stops.some((p) => p.id === a.id)) return s;
      return edited(s, { stops: s.stops.filter((p) => p.id !== a.id), selectedId });
    }
    case "stops/preset": {
      // Replace the stops with a preset group. The start is kept; without one, the user still
      // has to click a start, and the route appears as soon as they do.
      const picked = a.stops.slice(0, MAX_STOPS);
      const stops = picked.map((p, i): PlanPoint => ({ id: `stop-${s.nextStopNo + i}`, lon: p.lon, lat: p.lat, name: p.name }));
      const clipped = a.stops.length - picked.length;
      const notice = clipped > 0 ? `Showing the first ${MAX_STOPS} of ${a.stops.length} targets` : null;
      return { ...edited(s, { stops, nextStopNo: s.nextStopNo + stops.length, selectedId: stops[0]?.id ?? null }), notice };
    }
    case "select":
      return s.selectedId === a.id ? s : { ...s, selectedId: a.id };
    case "compare/set":
      return { ...s, compare: a.value };
    case "route/loading":
      return { ...s, status: "loading", error: null };
    case "route/success":
      return { ...s, route: a.route, routeVersion: a.version, status: "ready", error: null };
    case "route/failure":
      return { ...s, status: "error", error: a.message };
    case "notice/clear":
      return s.notice === null ? s : { ...s, notice: null };
    case "reset":
      return { ...initialPlannerState, compare: s.compare, planVersion: s.planVersion + 1 };
  }
}

export function buildRouteRequest(s: PlannerState): RouteRequest | null {
  if (!s.start || s.stops.length === 0) return null;
  return {
    start: { id: s.start.id, lon: s.start.lon, lat: s.start.lat },
    stops: s.stops.map((p) => ({ id: p.id, lon: p.lon, lat: p.lat, ...(p.name ? { name: p.name } : {}) })),
    constraints: { max_slope_deg: SLOPE_LIMITS.maxDeg },
    ...(s.compare ? { compare: true } : {}),
  };
}
