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
import type { LayerId, LayerInfo } from "../api/types.ts";
import { DEFAULT_ACTIVE_LAYERS } from "../config/layers.ts";
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
      .layers(ctrl.signal)
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
  }, []);

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

  return useMemo(() => ({ status, info, active, toggle, retry: load }), [status, info, active, toggle, load]);
}

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(plannerReducer, initialPlannerState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inflight = useRef<AbortController | null>(null);

  const fetchRoute = useCallback(async () => {
    const snapshot = stateRef.current;
    const request = buildRouteRequest(snapshot);
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
      console.error("Route request failed", e);
      dispatch({ type: "route/failure", message: describeError(e) });
    }
  }, []);

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
      addPoint: (lon, lat) => dispatch({ type: "point/add", lon, lat }),
      setPresetStops: (stops) => dispatch({ type: "stops/preset", stops }),
      movePoint: (id, lon, lat) => dispatch({ type: "point/move", id, lon, lat }),
      removePoint: (id) => dispatch({ type: "point/remove", id }),
      select: (id) => dispatch({ type: "select", id }),
      setCompare: (value) => dispatch({ type: "compare/set", value }),
      recalculate: () => void fetchRoute(),
      reset: () => dispatch({ type: "reset" }),
    }),
    [state, fetchRoute],
  );

  const layers = useLayersModel();
  const value = useMemo(() => ({ planner, layers }), [planner, layers]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
