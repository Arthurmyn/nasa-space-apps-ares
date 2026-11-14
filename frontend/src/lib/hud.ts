import type { LonLat, RouteResponse } from "../api/types.ts";
import { bearing, cumulativeLengths, haversine, metresPerDegLon, METRES_PER_DEG_LAT, pointAtFraction, ringCentroid } from "./geo.ts";
import { interpolateProfile } from "./profile.ts";
import { profileDistToFraction } from "./routeGeo.ts";
import { classifySlope, type SlopeClass, type SlopeLimits } from "./slope.ts";
import { stopLabel } from "./format.ts";

export interface HudHazard {
  id: string;
  label: string;
  /** Straight-line distance from the position to the zone centre, metres. */
  distM: number;
  /** Compass bearing to the zone centre, degrees clockwise from north. */
  bearingDeg: number;
}

export interface HudNext {
  /** Index into `route.stops`. */
  index: number;
  label: string;
  name: string;
  /** Distance along the route to the stop, metres. */
  distM: number;
  bearingDeg: number;
}

export interface HudModel {
  position: LonLat;
  headingDeg: number;
  slopeDeg: number;
  slopeClass: SlopeClass;
  /** Next stop ahead on the route, or null once the last stop is reached. */
  next: HudNext | null;
  /** Distance along the route to the final stop, metres. */
  destDistM: number;
  /** Zones sorted nearest first. */
  hazards: HudHazard[];
}

/** Wrap an angle to 0..360. */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Angle of `target` relative to `heading`, in -180..180 (negative = left). */
export function relativeBearing(targetDeg: number, headingDeg: number): number {
  return normalizeDeg(targetDeg - headingDeg + 180) - 180;
}

/**
 * Where a point is relative to a position facing `headingDeg`: metres to the right and
 * metres forward. Local flat approximation, fine for HUD ranges of a few hundred metres.
 */
export function toHeadingFrame(point: LonLat, origin: LonLat, headingDeg: number): { right: number; forward: number } {
  const east = (point[0] - origin[0]) * metresPerDegLon(origin[1]);
  const north = (point[1] - origin[1]) * METRES_PER_DEG_LAT;
  const h = (headingDeg * Math.PI) / 180;
  return {
    right: east * Math.cos(h) - north * Math.sin(h),
    forward: east * Math.sin(h) + north * Math.cos(h),
  };
}

/** Everything the HUD shows for a position `posDistM` metres along the route. */
export function computeHud(route: RouteResponse, posDistM: number, limits: SlopeLimits): HudModel | null {
  const at = pointAtFraction(route.polyline, profileDistToFraction(route.profile, posDistM));
  const sample = interpolateProfile(route.profile, posDistM);
  if (!at || !sample) return null;

  const position = at.point;
  // A 20m window follows the path, smoothing sub-metre click-to-cell connectors.
  // Shift the whole window inward at either endpoint, preserving forward travel direction.
  const lengths = cumulativeLengths(route.polyline);
  const length = lengths[lengths.length - 1] ?? 0;
  const windowM = Math.min(20, length);
  const fraction = profileDistToFraction(route.profile, posDistM);
  const fromM = Math.max(0, Math.min(length - windowM, fraction * length - windowM / 2));
  const from = length > 0 ? pointAtFraction(route.polyline, fromM / length) : null;
  const to = length > 0 ? pointAtFraction(route.polyline, (fromM + windowM) / length) : null;
  const headingDeg = from && to && haversine(from.point, to.point) > 1e-6 ? bearing(from.point, to.point) : at.bearingDeg;
  const nextIndex = route.stops.findIndex((s) => s.dist_m > posDistM + 0.5);
  const nextStop = nextIndex >= 0 ? route.stops[nextIndex] : undefined;
  const lastStop = route.stops[route.stops.length - 1];

  const hazards = route.hazards
    .map((h): HudHazard | null => {
      const ring = h.polygon.coordinates[0];
      const centre = ring ? ringCentroid(ring) : null;
      if (!centre) return null;
      return { id: h.id, label: h.label, distM: haversine(position, centre), bearingDeg: bearing(position, centre) };
    })
    .filter((h): h is HudHazard => h !== null)
    .sort((a, b) => a.distM - b.distM);

  return {
    position,
    headingDeg,
    slopeDeg: sample.slope_deg,
    slopeClass: classifySlope(sample.slope_deg, limits),
    next:
      nextStop && nextIndex >= 0
        ? {
            index: nextIndex,
            label: stopLabel(nextIndex),
            name: nextStop.name ?? `Stop ${stopLabel(nextIndex)}`,
            distM: nextStop.dist_m - posDistM,
            bearingDeg: bearing(position, [nextStop.lon, nextStop.lat]),
          }
        : null,
    destDistM: Math.max(0, (lastStop?.dist_m ?? route.distance_m) - posDistM),
    hazards,
  };
}
