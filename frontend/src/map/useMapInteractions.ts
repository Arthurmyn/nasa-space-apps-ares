import { useEffect, useRef } from "react";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import type { LonLat, RouteResponse } from "../api/types.ts";
import { KEY_STEP_PX, KEY_STEP_PX_FAST, ROUTE_HOVER_SNAP_PX } from "../config/route.ts";
import { metresPerPixel, offsetLonLat, projectOnPath } from "../lib/geo.ts";
import { fractionToProfileDist } from "../lib/routeGeo.ts";
import { hoverStore } from "../state/hoverStore.ts";
import type { PlanPoint } from "../state/plannerReducer.ts";
import { MARKER_CLASS } from "./useMarkers.ts";
import { prefersReducedMotion } from "./theme.ts";

interface Deps {
  route: RouteResponse | null;
  stale: boolean;
  selected: PlanPoint | null;
  onAdd: (lon: number, lat: number) => void;
  onMove: (id: string, lon: number, lat: number) => void;
  onSelect: (id: string | null) => void;
  onCursor: (at: LonLat | null) => void;
}

const ARROWS: Record<string, readonly [dx: number, dy: number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Click to add points, cursor readout, route hover sync and keyboard control. The latest props
 * are read through a ref so listeners are bound once per map, not on every state change.
 */
export function useMapInteractions(map: MapLibreMap | null, deps: Deps): void {
  const ref = useRef(deps);
  ref.current = deps;

  useEffect(() => {
    if (!map) return;
    const container = map.getCanvasContainer();

    const onClick = (e: MapMouseEvent) => {
      const target = e.originalEvent.target;
      if (target instanceof Element && target.closest(`.${MARKER_CLASS}`)) return;
      ref.current.onAdd(e.lngLat.lng, e.lngLat.lat);
    };

    // Coalesce pointer moves to one update per frame to keep panning smooth.
    let pending: LonLat | null = null;
    let frame = 0;
    const flush = () => {
      frame = 0;
      const { route, stale, onCursor } = ref.current;
      onCursor(pending);
      if (pending && route && !stale) {
        const hit = projectOnPath(route.polyline, pending);
        const mpp = metresPerPixel(pending[1], map.getZoom());
        if (hit && hit.offsetM / mpp <= ROUTE_HOVER_SNAP_PX) {
          hoverStore.set(fractionToProfileDist(route.profile, hit.fraction), "map");
          return;
        }
      }
      if (hoverStore.get().source === "map") hoverStore.clear();
    };
    const schedule = (at: LonLat | null) => {
      pending = at;
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const onMove = (e: MapMouseEvent) => schedule([e.lngLat.lng, e.lngLat.lat]);
    const onLeave = () => schedule(null);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const { selected, onMove: move, onSelect } = ref.current;
      const arrow = ARROWS[e.key];

      if (arrow) {
        const stepPx = e.shiftKey ? KEY_STEP_PX_FAST : KEY_STEP_PX;
        if (selected) {
          const mpp = metresPerPixel(selected.lat, map.getZoom());
          // Screen y grows downward, north is up.
          const [lon, lat] = offsetLonLat([selected.lon, selected.lat], arrow[0] * stepPx * mpp, -arrow[1] * stepPx * mpp);
          move(selected.id, lon, lat);
        } else {
          map.panBy([arrow[0] * stepPx * 4, arrow[1] * stepPx * 4], { animate: false });
        }
      } else if (e.key === "Escape") {
        onSelect(null);
      } else if (e.key === "+" || e.key === "=") {
        map.zoomIn({ duration: prefersReducedMotion() ? 0 : 200 });
      } else if (e.key === "-" || e.key === "_") {
        map.zoomOut({ duration: prefersReducedMotion() ? 0 : 200 });
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };

    map.on("click", onClick);
    map.on("mousemove", onMove);
    map.on("mouseout", onLeave);
    container.addEventListener("keydown", onKeyDown);
    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMove);
      map.off("mouseout", onLeave);
      container.removeEventListener("keydown", onKeyDown);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [map]);
}
