import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { RouteResponse } from "../api/types.ts";
import { stopLabel } from "./format.ts";

export interface ExportContext {
  siteId: string;
  siteName: string;
}

/**
 * The route as GeoJSON for a GIS or a rover-ops tool: the route line, the start, the stops and the
 * steep-slope zones. Coordinates are [lon, lat] degrees, east-positive, on the Mars sphere that the
 * terrain grid uses (docs/DATA_CONTRACT.md, section 4), not on Earth's WGS 84. The file is a pure
 * function of the route, so the same route always exports the same bytes.
 */
export function routeToGeoJson(route: RouteResponse, ctx: ExportContext): FeatureCollection {
  const start = route.polyline[0];
  const features: Feature[] = [];

  const line: Feature<LineString> = {
    type: "Feature",
    properties: {
      kind: "route",
      name: "Planned route",
      distance_m: round(route.distance_m, 1),
      est_time_s: Math.round(route.est_time_s),
      max_slope_deg: round(route.max_slope_deg, 1),
      safety: route.safety,
      ...(route.readiness ? { readiness: route.readiness.level, readiness_reasons: route.readiness.reasons } : {}),
      ...(route.route_profile ? { profile: route.route_profile } : {}),
      ...(route.round_trip_time_s != null ? { round_trip_time_s: Math.round(route.round_trip_time_s) } : {}),
      ...(route.stats ? { slope_class_pct: route.stats.slope_class_pct, climb_m: round(route.stats.climb_m, 1), descent_m: round(route.stats.descent_m, 1) } : {}),
      computed_at: route.computed_at,
    },
    geometry: { type: "LineString", coordinates: route.polyline.map(([lon, lat]) => [lon, lat]) },
  };
  features.push(line);

  if (start) {
    features.push(point("start", "Start", [start[0], start[1]], { dist_m: 0 }));
  }
  route.stops.forEach((s, i) => {
    features.push(
      point("stop", s.name ?? `Stop ${stopLabel(i)}`, [s.lon, s.lat], {
        label: stopLabel(i),
        dist_m: round(s.dist_m, 1),
        ...(s.note ? { note: s.note } : {}),
      }),
    );
  });
  for (const h of route.hazards) {
    const polygon: Feature<Polygon> = {
      type: "Feature",
      properties: { kind: "hazard", hazard_kind: h.kind, name: h.label },
      geometry: { type: "Polygon", coordinates: h.polygon.coordinates.map((ring) => ring.map(([lon, lat]) => [lon, lat])) },
    };
    features.push(polygon);
  }

  return {
    type: "FeatureCollection",
    // A foreign member: GeoJSON allows extra members on a collection.
    ...({
      name: `ARES route, ${ctx.siteName}`,
      ares: {
        site_id: ctx.siteId,
        computed_at: route.computed_at,
        coordinates: "[longitude, latitude] in degrees, east-positive, on the Mars sphere of radius 3396190 m. Not Earth WGS 84.",
        note: "Candidate route for planning support. Not a safety guarantee.",
      },
    } as object),
    features,
  };
}

function point(kind: string, name: string, coordinates: [number, number], extra: Record<string, unknown>): Feature<Point> {
  return { type: "Feature", properties: { kind, name, ...extra }, geometry: { type: "Point", coordinates } };
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

/** "ares-route-gale-bx-20261115T054500Z.geojson"; falls back to no stamp when the time is unreadable. */
export function exportFileName(siteId: string, computedAt: string): string {
  const d = new Date(computedAt);
  const stamp = Number.isNaN(d.getTime()) ? "" : `-${d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`;
  const safeId = siteId.replace(/[^a-z0-9-]/gi, "_");
  return `ares-route-${safeId}${stamp}.geojson`;
}
