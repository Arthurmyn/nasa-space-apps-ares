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

interface HudPath {
  lengths: readonly number[];
  headings: readonly number[];
}

// Responses are immutable. Prepare distance and heading lookups once per route.
const hudPaths = new WeakMap<RouteResponse, HudPath>();

function hudPath(route: RouteResponse): HudPath {
  let prepared = hudPaths.get(route);
  if (!prepared) {
    const lengths = route.navigation?.vertex_dist_m ?? cumulativeLengths(route.polyline);
    const headings = route.polyline.slice(1).map((_, edge) => {
      const reference = route.navigation?.heading_segments[edge] ?? edge;
      const from = route.polyline[reference];
      const to = route.polyline[reference + 1];
      return from && to ? bearing(from, to) : 0;
    });
    prepared = { lengths, headings };
    hudPaths.set(route, prepared);
  }
  return prepared;
}

/** Use the outgoing edge at a vertex, and the incoming edge at the final vertex. */
function pathHeading(path: HudPath, targetM: number): number {
  let lo = 0;
  let hi = path.headings.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((path.lengths[mid + 1] ?? 0) <= targetM + 1e-9) lo = mid + 1;
    else hi = mid;
  }
  return path.headings[lo] ?? 0;
}

/** Everything the HUD shows for a position `posDistM` metres along the route. */
export function computeHud(route: RouteResponse, posDistM: number, limits: SlopeLimits): HudModel | null {
  const path = hudPath(route);
  const lengths = path.lengths;
  const total = lengths[lengths.length - 1] ?? 0;
  const fraction = route.navigation
    ? (total > 0 ? Math.min(1, Math.max(0, posDistM / total)) : 0)
    : profileDistToFraction(route.profile, posDistM);
  const at = pointAtFraction(route.polyline, fraction, lengths);
  const sample = interpolateProfile(route.profile, posDistM);
  if (!at || !sample) return null;

  const position = at.point;
  const length = lengths[lengths.length - 1] ?? 0;
  const headingDeg = pathHeading(path, fraction * length);
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

const WINDS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Eight-point compass side for a heading in degrees. */
export function compassPoint(deg: number): (typeof WINDS)[number] {
  return WINDS[Math.round(normalizeDeg(deg) / 45) % 8] as (typeof WINDS)[number];
}

/** "000° N", the heading as three digits and its compass side. */
export function formatHeading(deg: number): string {
  const whole = Math.round(normalizeDeg(deg)) % 360;
  return `${String(whole).padStart(3, "0")}° ${compassPoint(whole)}`;
}

/** The API writes "Slope over 15 deg"; the HUD shows the degree sign. */
export function hazardLabel(label: string): string {
  return label.replace(/\s*deg\b/g, "°");
}

export interface NearestHazard {
  id: string;
  label: string;
  /** Metres from the position to the edge of the zone; 0 when the position is inside it. */
  distM: number;
}

type Pair = readonly [number, number];

function distanceToSegment(p: Pair, a: Pair, b: Pair): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function insideRing(p: Pair, ring: readonly Pair[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i] as Pair;
    const b = ring[j] as Pair;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/**
 * The hazard zone whose edge is nearest to `position` (metres, flat local approximation), or null
 * when the route has no zones. A zone the position is inside counts as 0 m away.
 */
export function nearestHazard(route: RouteResponse, position: LonLat): NearestHazard | null {
  const mLon = metresPerDegLon(position[1]);
  const local = (p: LonLat): Pair => [(p[0] - position[0]) * mLon, (p[1] - position[1]) * METRES_PER_DEG_LAT];
  const origin: Pair = [0, 0];
  let best: NearestHazard | null = null;
  for (const zone of route.hazards) {
    const [outer, ...holes] = zone.polygon.coordinates.map((ring) => ring.map(local));
    if (!outer || outer.length < 2) continue;
    let d = Infinity;
    if (insideRing(origin, outer) && !holes.some((h) => insideRing(origin, h))) d = 0;
    else {
      for (const ring of [outer, ...holes]) {
        for (let i = 1; i < ring.length; i += 1) d = Math.min(d, distanceToSegment(origin, ring[i - 1] as Pair, ring[i] as Pair));
      }
    }
    if (!best || d < best.distM) best = { id: zone.id, label: zone.label, distM: d };
  }
  return best;
}
