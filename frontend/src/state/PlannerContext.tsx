import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api/client.ts";
import { describeError } from "../api/errors.ts";
import { ApiError } from "../api/types.ts";
import { stopLabel } from "../lib/format.ts";
import { decodePlan, encodePlan } from "../lib/planUrl.ts";
import { clampToBbox, insideBbox } from "../lib/siteGeo.ts";
import { useSite } from "./SiteContext.tsx";
import type { LayerId, LayerInfo } from "../api/types.ts";
import { DEFAULT_ACTIVE_LAYERS } from "../config/layers.ts";
import { availableLayers } from "../config/layerAvailability.ts";
import { NOTICE_MS, ROUTE_DEBOUNCE_MS } from "../config/route.ts";
import {
  buildRouteRequest,
  initialPlannerState,
  isRoutable,
  isStale,
  plannerReducer,
  routeView,
  type PlannerState,
  type PresetStop,
  type RouteView,
} from "./plannerReducer.ts";

export type LayersStatus = "loading" | "ready" | "error";

export interface LayersModel {
  status: LayersStatus;
  info: Partial<Record<LayerId, LayerInfo>>;
  /** Layers the user switched on. A layer only draws when it is also available. */
  active: ReadonlySet<LayerId>;
  toggle: (id: LayerId) => void;
  retry: () => void;
}

export interface PlannerModel {
  state: PlannerState;
  view: RouteView;
  stale: boolean;
  /** True while a route request is in flight. */
  fetching: boolean;
  addPoint: (lon: number, lat: number) => void;
  /** Replace the stops with a preset group of targets (at most MAX_STOPS are used). */
  setPresetStops: (stops: readonly PresetStop[]) => void;
  movePoint: (id: string, lon: number, lat: number) => void;
  removePoint: (id: string) => void;
  select: (id: string | null) => void;
  setCompare: (value: boolean) => void;
  recalculate: () => void;
  reset: () => void;
}

interface AppModel {
  planner: PlannerModel;
  layers: LayersModel;
}

const Ctx = createContext<AppModel | null>(null);

export function useApp(): AppModel {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp must be used inside <PlannerProvider>");
  return value;
}

export const usePlanner = (): PlannerModel => useApp().planner;
export const useLayers = (): LayersModel => useApp().layers;

function useLayersModel(): LayersModel {
  const { site } = useSite();
  const siteId = site.id;
  const [status, setStatus] = useState<LayersStatus>("loading");
  const [info, setInfo] = useState<Partial<Record<LayerId, LayerInfo>>>({});
  const [active, setActive] = useState<ReadonlySet<LayerId>>(() => new Set(DEFAULT_ACTIVE_LAYERS));
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setStatus("loading");
    api
      .layers(siteId, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setInfo(Object.fromEntries(res.layers.map((l) => [l.id, l])));
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        console.error("Failed to load layer list", e);
        setStatus("error");
      });
  }, [siteId]);

  useEffect(() => {
    load();
    return () => inflight.current?.abort();
  }, [load]);

  const toggle = useCallback((id: LayerId) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return useMemo(() => ({ status, info: availableLayers(site, info), active, toggle, retry: load }), [status, info, active, toggle, load, site]);
}

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(plannerReducer, initialPlannerState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inflight = useRef<AbortController | null>(null);
  const { site } = useSite();
  const siteId = site.id;
  const bbox = site.bbox;

  // Restore a plan from the URL hash once, so a shared link opens on the same points.
  useEffect(() => {
    const plan = decodePlan(window.location.hash);
    const inside = ([lon, lat]: readonly [number, number]) => insideBbox(bbox, lon, lat);
    const start = plan.start && inside(plan.start) ? { lon: plan.start[0], lat: plan.start[1] } : null;
    const stops = plan.stops.filter(inside).map(([lon, lat]) => ({ lon, lat }));
    if (start || stops.length > 0) dispatch({ type: "plan/load", start, stops });
  }, [bbox]);

  // Keep the hash in step with the points. replaceState: editing a plan is not page navigation.
  useEffect(() => {
    const hash = encodePlan({
      start: state.start ? [state.start.lon, state.start.lat] : null,
      stops: state.stops.map((p) => [p.lon, p.lat] as const),
    });
    const next = hash ? `#${hash}` : window.location.pathname + window.location.search;
    if (window.location.hash !== (hash ? `#${hash}` : "")) window.history.replaceState(null, "", next);
  }, [state.start, state.stops]);

  const fetchRoute = useCallback(async () => {
    const snapshot = stateRef.current;
    const request = buildRouteRequest(snapshot, siteId);
    if (!request) return;

    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    dispatch({ type: "route/loading" });
    try {
      const route = await api.route(request, ctrl.signal);
      if (!ctrl.signal.aborted) dispatch({ type: "route/success", route, version: snapshot.planVersion });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      // A 422 is an expected answer ("no route between these points"), not a fault.
      const expected = e instanceof ApiError && e.status === 422;
      (expected ? console.warn : console.error)("Route request failed", e);
      const labelFor = (id: string) => {
        if (id === "start") return "Start";
        const i = snapshot.stops.findIndex((p) => p.id === id);
        return i === -1 ? null : `Stop ${stopLabel(i)}`;
      };
      dispatch({ type: "route/failure", message: describeError(e, labelFor) });
    }
  }, [siteId]);

  // Debounced recompute after every edit to the points.
  useEffect(() => {
    if (state.planVersion === 0) return;
    if (!isRoutable(stateRef.current)) {
      inflight.current?.abort();
      return;
    }
    const timer = window.setTimeout(() => void fetchRoute(), ROUTE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state.planVersion, fetchRoute]);

  // Turning Compare on needs an alternative from the API; refetch if the route is current.
  const prevCompare = useRef(state.compare);
  useEffect(() => {
    if (prevCompare.current === state.compare) return;
    prevCompare.current = state.compare;
    const s = stateRef.current;
    if (state.compare && s.route && !s.route.alternative && !isStale(s)) void fetchRoute();
  }, [state.compare, fetchRoute]);

  // Notices ("Maximum of 5 stops reached") fade after a few seconds.
  const notice = state.notice;
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => dispatch({ type: "notice/clear" }), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => () => inflight.current?.abort(), []);

  const planner = useMemo<PlannerModel>(
    () => ({
      state,
      view: routeView(state),
      stale: isStale(state),
      fetching: state.status === "loading",
      addPoint: (lon, lat) =>
        insideBbox(bbox, lon, lat)
          ? dispatch({ type: "point/add", lon, lat })
          : dispatch({ type: "notice/set", message: "That point is outside the terrain grid. Click inside the shaded area." }),
      setPresetStops: (stops) => dispatch({ type: "stops/preset", stops }),
      movePoint: (id, lon, lat) => {
        const [x, y] = clampToBbox(bbox, lon, lat);
        dispatch({ type: "point/move", id, lon: x, lat: y });
      },
      removePoint: (id) => dispatch({ type: "point/remove", id }),
      select: (id) => dispatch({ type: "select", id }),
      setCompare: (value) => dispatch({ type: "compare/set", value }),
      recalculate: () => void fetchRoute(),
      reset: () => dispatch({ type: "reset" }),
    }),
    [state, fetchRoute, bbox],
  );

  const layers = useLayersModel();
  const value = useMemo(() => ({ planner, layers }), [planner, layers]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
