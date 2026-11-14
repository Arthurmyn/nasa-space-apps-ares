import "maplibre-gl/dist/maplibre-gl.css";
import "./worker.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapLibreMap } from "maplibre-gl";
import { Icon, type IconName } from "../components/Icon.tsx";
import { boundsOf, type Bounds } from "../lib/geo.ts";
import { boundsOfBbox } from "../lib/siteGeo.ts";
import { formatCoordinates } from "../lib/format.ts";
import { useApp } from "../state/PlannerContext.tsx";
import { useSite } from "../state/SiteContext.tsx";
import { buildStopEntries } from "../state/stopEntries.ts";
import { viewportStore } from "../state/viewportStore.ts";
import { CoordinateTicks, NorthArrow, ScaleBar, ZoomControls } from "./MapOverlays.tsx";
import { addAresLayers, baseStyle } from "./layers.ts";
import { getMapTheme, prefersReducedMotion } from "./theme.ts";
import { useGridModel } from "./useGridModel.ts";
import { useHazardLabels, useHoverMarker, usePinMarkers } from "./useMarkers.ts";
import { useMapInteractions } from "./useMapInteractions.ts";
import { useRasterLayers } from "./useRasterLayers.ts";
import { useRouteOverlay } from "./useRouteOverlay.ts";

/** Margin around the site when the map first opens. */
const INITIAL_PADDING_PX = 40;

const KEYBOARD_HINT =
  "Map. Click to add points. Arrow keys move the selected stop, or pan when nothing is selected. Plus and minus zoom. Escape clears the selection.";

function MapStatus() {
  const { planner } = useApp();
  const { state, view, fetching, stale } = planner;

  let content: { icon: IconName; text: string; spin?: boolean } | null = null;
  if (!state.start) content = { icon: "crosshair", text: "Click the map to set a start point" };
  else if (state.stops.length === 0) content = { icon: "flag", text: "Click again to add a stop, up to 5" };
  else if (view === "error") content = { icon: "alert", text: "Route failed. See the route summary" };
  else if (fetching || view === "loading") content = { icon: "clock", text: stale ? "Recalculating route" : "Computing route", spin: true };
  else if (stale) content = { icon: "clock", text: "Points changed. Recalculating shortly" };

  return (
    <div className="map-status" role="status">
      {state.notice && (
        <p className="map-pill map-pill--warn">
          <Icon name="alert" /> {state.notice}
        </p>
      )}
      {content && (
        <p className="map-pill">
          {content.spin ? <span className="spinner" aria-hidden="true" /> : <Icon name={content.icon} />} {content.text}
        </p>
      )}
    </div>
  );
}

export default function MapView() {
  const { planner, layers } = useApp();
  const { site } = useSite();
  const { state } = planner;
  const hostRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLOutputElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let instance: MapLibreMap;
    try {
      const theme = getMapTheme();
      instance = new MapLibreMap({
        container: host,
        style: baseStyle(theme),
        // Open on the whole grid, with a margin so it does not touch the panels or controls.
        bounds: boundsOfBbox(site.bbox),
        fitBoundsOptions: { padding: INITIAL_PADDING_PX },
        minZoom: 4,
        maxZoom: 20,
        renderWorldCopies: false,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
        keyboard: false, // arrow keys move the selected stop instead; see useMapInteractions
        doubleClickZoom: false, // a double click would add two points
        attributionControl: { compact: true },
        reduceMotion: prefersReducedMotion(),
        fadeDuration: 0,
      });
      instance.touchZoomRotate.disableRotation();
      instance.getCanvas().tabIndex = 0;
      instance.getCanvas().setAttribute("aria-label", KEYBOARD_HINT);
      instance.once("load", () => {
        addAresLayers(instance, theme);
        setMap(instance);
      });
      instance.on("moveend", () => {
        const c = instance.getCenter();
        viewportStore.setCentre([c.lng, c.lat]);
      });
    } catch (e) {
      console.error("Map failed to start", e);
      setMapError("The map could not start. This browser may not support WebGL 2.");
      return;
    }
    return () => {
      instance.remove();
      setMap(null);
    };
    // The map is created once per site; a different site remounts the page.
  }, []);

  const entries = useMemo(() => buildStopEntries(state), [state]);
  const route = state.route;
  const slopeOn = layers.active.has("slope") && layers.info.slope?.available === true;
  const selectedPoint = useMemo(
    () => [state.start, ...state.stops].find((p) => p?.id === state.selectedId) ?? null,
    [state.start, state.stops, state.selectedId],
  );

  useRouteOverlay(map, { route, stale: planner.stale, compare: state.compare, slopeOn });
  useRasterLayers(map, layers, site);
  usePinMarkers(map, entries, state.selectedId, { select: planner.select, move: planner.movePoint });
  useHazardLabels(map, route?.hazards ?? []);
  useHoverMarker(map, route && !planner.stale ? route : null);
  useMapInteractions(map, {
    route,
    stale: planner.stale,
    selected: selectedPoint,
    onAdd: planner.addPoint,
    onMove: planner.movePoint,
    onSelect: planner.select,
    onCursor: (at) => {
      if (readoutRef.current) readoutRef.current.textContent = at ? formatCoordinates(at[1], at[0], 5) : "–";
    },
  });
  const grid = useGridModel(map);

  // Frame the first route that arrives. Later recomputes keep the user's view.
  const framed = useRef(false);
  useEffect(() => {
    if (!route) {
      framed.current = false;
      return;
    }
    if (!map || framed.current) return;
    framed.current = true;
    const points = [...route.polyline, ...route.hazards.flatMap((h) => h.polygon.coordinates.flat())];
    const b: Bounds | null = boundsOf(points);
    if (b) {
      map.fitBounds(
        [
          [b.west, b.south],
          [b.east, b.north],
        ],
        { padding: 80, maxZoom: 19, duration: prefersReducedMotion() ? 0 : 500 },
      );
    }
  }, [map, route]);

  if (mapError) {
    return (
      <div className="map-wrap map-wrap--error" role="alert">
        <Icon name="alert" size={20} />
        <p>{mapError}</p>
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <div ref={hostRef} className="ares-map" />
      {map && grid && (
        <>
          <CoordinateTicks map={map} grid={grid} />
          <ScaleBar grid={grid} />
        </>
      )}
      {map && <NorthArrow />}
      {map && <ZoomControls map={map} />}
      <MapStatus />
      <div className="map-readout" aria-live="off">
        <span className="eyebrow">Cursor</span>
        <output ref={readoutRef} className="mono">
          –
        </output>
      </div>
      {state.compare && route && (
        <ul className="map-key" aria-label="Map key">
          <li>
            <span className="map-key__line map-key__line--route" aria-hidden="true" /> Route
          </li>
          <li>
            <span className="map-key__line map-key__line--alt" aria-hidden="true" /> Alternative
          </li>
        </ul>
      )}
    </div>
  );
}
