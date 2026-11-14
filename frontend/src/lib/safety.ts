import type { LonLat } from "../api/types.ts";
import { cumulativeLengths, haversine } from "./geo.ts";

export interface SafetyMargins {
  /** Largest straight-line distance from the start to any point of the route, metres. */
  farthestM: number;
  /** Distance along the route from the start to that farthest point, metres. */
  alongRouteM: number;
}

/** How far from the start the route gets, in a straight line and along the path. Null for an empty path. */
export function safetyMargins(polyline: readonly LonLat[]): SafetyMargins | null {
  const start = polyline[0];
  if (!start) return null;
  const along = cumulativeLengths(polyline);
  let farthestM = 0;
  let alongRouteM = 0;
  polyline.forEach((p, i) => {
    const d = haversine(start, p);
    if (d > farthestM) {
      farthestM = d;
      alongRouteM = along[i] ?? 0;
    }
  });
  return { farthestM, alongRouteM };
}

/** Walking speed the route was computed with, m/s, from the response itself. Null if it cannot be told. */
export function routeSpeedMps(distanceM: number, estTimeS: number): number | null {
  return estTimeS > 0 && distanceM > 0 ? distanceM / estTimeS : null;
}

/** Time to retrace the route from its farthest point back to the start at the route's own speed, seconds. */
export function walkBackTimeS(margins: SafetyMargins, speedMps: number | null): number | null {
  return speedMps && speedMps > 0 ? margins.alongRouteM / speedMps : null;
}
