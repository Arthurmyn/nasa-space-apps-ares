import { useEffect, useRef, type MutableRefObject } from "react";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import type { RouteResponse } from "../api/types.ts";
import { formatCoordinates } from "../lib/format.ts";
import { pointAtFraction } from "../lib/geo.ts";
import { profileDistToFraction } from "../lib/routeGeo.ts";
import type { StopEntry } from "../state/stopEntries.ts";
import { hoverStore } from "../state/hoverStore.ts";

/** Marker elements carry this class so map click handling can ignore clicks that land on them. */
export const MARKER_CLASS = "map-marker";

interface PinHandlers {
  select: (id: string) => void;
  move: (id: string, lon: number, lat: number) => void;
}

interface PinRecord {
  marker: Marker;
  el: HTMLButtonElement;
}

const DRAG_CLICK_GUARD_MS = 300;

function createPin(entry: StopEntry, handlers: MutableRefObject<PinHandlers>): PinRecord {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `${MARKER_CLASS} pin-marker pin-marker--${entry.kind}`;
  el.dataset.markerId = entry.id;

  let lastDragEnd = 0;
  el.addEventListener("click", (e) => {
    // Keep the click from reaching the map, which would add a new point under the marker.
    e.stopPropagation();
    if (performance.now() - lastDragEnd < DRAG_CLICK_GUARD_MS) return;
    handlers.current.select(entry.id);
  });
  el.addEventListener("focus", () => handlers.current.select(entry.id));

  const marker = new Marker({ element: el, draggable: true, clickTolerance: 4 });
  marker.on("dragstart", () => handlers.current.select(entry.id));
  marker.on("dragend", () => {
    lastDragEnd = performance.now();
    const { lng, lat } = marker.getLngLat();
    handlers.current.move(entry.id, lng, lat);
  });
  return { marker, el };
}

/** Draggable start and stop pins, kept in sync with the planner without recreating DOM. */
export function usePinMarkers(
  map: MapLibreMap | null,
  entries: readonly StopEntry[],
  selectedId: string | null,
  handlers: PinHandlers,
): void {
  const pins = useRef(new Map<string, PinRecord>());
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!map) return;
    const live = new Set(entries.map((e) => e.id));

    for (const [id, rec] of pins.current) {
      if (!live.has(id)) {
        rec.marker.remove();
        pins.current.delete(id);
      }
    }

    for (const entry of entries) {
      let rec = pins.current.get(entry.id);
      if (!rec) {
        rec = createPin(entry, handlersRef);
        rec.marker.setLngLat([entry.lon, entry.lat]).addTo(map);
        pins.current.set(entry.id, rec);
      } else {
        const cur = rec.marker.getLngLat();
        if (cur.lng !== entry.lon || cur.lat !== entry.lat) rec.marker.setLngLat([entry.lon, entry.lat]);
      }
      const selected = entry.id === selectedId;
      rec.el.textContent = entry.label;
      rec.el.classList.toggle("pin-marker--selected", selected);
      rec.el.setAttribute("aria-pressed", String(selected));
      rec.el.setAttribute(
        "aria-label",
        `${entry.title}, ${formatCoordinates(entry.lat, entry.lon, 4)}. Drag or use arrow keys to move`,
      );
    }
  }, [map, entries, selectedId]);

  useEffect(
    () => () => {
      for (const rec of pins.current.values()) rec.marker.remove();
      pins.current.clear();
    },
    [],
  );
}

/** White dot on the route that follows the shared hover position (set by the map or the profile). */
export function useHoverMarker(map: MapLibreMap | null, route: RouteResponse | null): void {
  useEffect(() => {
    if (!map || !route) return;
    const el = document.createElement("div");
    el.className = "hover-marker";
    el.hidden = true;
    const marker = new Marker({ element: el }).setLngLat([0, 0]).addTo(map);

    const update = () => {
      const { distM } = hoverStore.get();
      if (distM === null) {
        el.hidden = true;
        return;
      }
      const at = pointAtFraction(route.polyline, profileDistToFraction(route.profile, distM));
      if (!at) {
        el.hidden = true;
        return;
      }
      marker.setLngLat([at.point[0], at.point[1]]);
      el.hidden = false;
    };
    update();
    const unsubscribe = hoverStore.subscribe(update);
    return () => {
      unsubscribe();
      marker.remove();
    };
  }, [map, route]);
}
