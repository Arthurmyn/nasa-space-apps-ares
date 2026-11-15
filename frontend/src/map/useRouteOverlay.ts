import { useEffect } from "react";
import type { Feature, FeatureCollection, GeoJsonProperties, Position } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { LonLat, RouteResponse } from "../api/types.ts";
import { SLOPE_LIMITS } from "../config/route.ts";
import { slopeLines } from "../lib/routeGeo.ts";
import { LYR, SRC } from "./layers.ts";
import { prefersReducedMotion } from "./theme.ts";

const collection = (features: Feature[]): FeatureCollection => ({ type: "FeatureCollection", features });
// The app's LonLat tuples are readonly; GeoJSON typings want mutable arrays.
const toPositions = (path: readonly LonLat[]): Position[] => path.map(([lon, lat]) => [lon, lat]);
const line = (path: readonly LonLat[], properties: GeoJsonProperties = {}): Feature => ({
  type: "Feature",
  properties,
  geometry: { type: "LineString", coordinates: toPositions(path) },
});

function setData(map: MapLibreMap, id: string, data: FeatureCollection) {
  map.getSource<GeoJSONSource>(id)?.setData(data);
}

interface OverlayInput {
  route: RouteResponse | null;
  /** The route no longer matches the points: draw it as a faded ghost. */
  stale: boolean;
  compare: boolean;
  slopeOn: boolean;
}

/** Push route, slope, alternative and hazard data into the map sources. */
export function useRouteOverlay(map: MapLibreMap | null, { route, stale, compare, slopeOn }: OverlayInput): void {
  useEffect(() => {
    if (!map) return;
    const polyline = route?.polyline ?? [];

    setData(map, SRC.route, collection(route ? [line(polyline)] : []));
    setData(
      map,
      SRC.routeSlope,
      collection(route ? slopeLines(polyline, route.profile, SLOPE_LIMITS).map((l) => line(l.coordinates, { cls: l.cls })) : []),
    );
    setData(
      map,
      SRC.alt,
      collection(compare && route?.alternative ? [line(route.alternative.polyline)] : []),
    );
    setData(
      map,
      SRC.hazards,
      collection(
        (route?.hazards ?? []).map((h) => ({
          type: "Feature",
          properties: { id: h.id, kind: h.kind, label: h.label },
          geometry: { type: "Polygon", coordinates: h.polygon.coordinates.map(toPositions) },
        })),
      ),
    );
  }, [map, route, compare]);

  // Fade the old route to a ghost while it is out of date. No transition for reduced motion.
  useEffect(() => {
    if (!map) return;
    const duration = prefersReducedMotion() ? 0 : 300;
    for (const id of [LYR.route, LYR.routeCasing, LYR.routeGlow, LYR.alt]) {
      map.setPaintProperty(id, "line-opacity-transition", { duration, delay: 0 });
    }
    map.setPaintProperty(LYR.route, "line-opacity", stale ? 0.3 : 1);
    map.setPaintProperty(LYR.routeCasing, "line-opacity", stale ? 0.3 : 0.9);
    map.setPaintProperty(LYR.routeGlow, "line-opacity", stale ? 0 : 0.45);
    map.setPaintProperty(LYR.alt, "line-opacity", stale ? 0.3 : 0.9);
  }, [map, stale]);

  useEffect(() => {
    if (!map) return;
    const visible = slopeOn && !stale ? "visible" : "none";
    for (const id of [LYR.slopeOk, LYR.slopeCaution, LYR.slopeAvoid]) {
      map.setLayoutProperty(id, "visibility", visible);
    }
  }, [map, slopeOn, stale]);
}
