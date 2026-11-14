import type { LonLat } from "../api/types.ts";

/**
 * Radius of the Mars sphere in metres: 3396.19 km, the sphere of the HiRISE DTM and of the whole
 * site grid (`mars_radius_m` in backend/data/gale-bx/meta.json, read from the PDS labels). The
 * route length from the API is computed on this sphere, so distances drawn on the map use it too;
 * a test compares this constant with meta.json. (The IAU mean radius, 3389.5 km, is 0.2% smaller.)
 * All ground distances in the UI use Mars, never Earth. MapLibre's built-in scale bar
 * assumes Earth, so scale and grid spacing are computed here instead.
 */
export const MARS_RADIUS_M = 3_396_190;

const DEG = Math.PI / 180;
/** Metres per degree of latitude (sphere). */
export const METRES_PER_DEG_LAT = MARS_RADIUS_M * DEG;

/** Metres per degree of longitude at a latitude (sphere). */
export function metresPerDegLon(latDeg: number): number {
  return METRES_PER_DEG_LAT * Math.cos(latDeg * DEG);
}

/** Great-circle distance between two points on Mars, metres. */
export function haversine(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b in degrees clockwise from north, 0..360. */
export function bearing(a: LonLat, b: LonLat): number {
  const lat1 = a[1] * DEG;
  const lat2 = b[1] * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Move a point by metres east/north (local flat approximation, fine below ~50 km). */
export function offsetLonLat(point: LonLat, eastM: number, northM: number): LonLat {
  const lat = point[1] + northM / METRES_PER_DEG_LAT;
  const cos = Math.cos(point[1] * DEG);
  // Guard the pole singularity; the UI never plans there but a NaN would poison state.
  const lon = point[0] + (cos > 1e-6 ? eastM / (METRES_PER_DEG_LAT * cos) : 0);
  return [lon, lat];
}

/** Ground metres covered by one screen pixel (Web Mercator, 512px tiles). */
export function metresPerPixel(latDeg: number, zoom: number, tileSize = 512): number {
  return (2 * Math.PI * MARS_RADIUS_M * Math.cos(latDeg * DEG)) / (tileSize * 2 ** zoom);
}

/** Round down to 1, 2 or 5 times a power of ten. */
export function niceNumber(value: number): number {
  if (!(value > 0)) return 0;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  const nice = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return nice * pow;
}

export interface ScaleBar {
  metres: number;
  widthPx: number;
  label: string;
}

/** Largest "nice" bar that fits in maxWidthPx. Returns null when nothing sensible fits. */
export function computeScaleBar(metresPerPx: number, maxWidthPx: number): ScaleBar | null {
  if (!(metresPerPx > 0) || !(maxWidthPx > 0)) return null;
  const metres = niceNumber(metresPerPx * maxWidthPx);
  if (metres <= 0) return null;
  const label = metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
  return { metres, widthPx: metres / metresPerPx, label };
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function boundsOf(points: readonly LonLat[]): Bounds | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of points) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { west, south, east, north };
}

/** Grid spacing in degrees: a "nice" metre step, about `targetLines` lines across the view. */
export function gridStepDeg(bounds: Bounds, targetLines = 6): number {
  const centreLat = (bounds.north + bounds.south) / 2;
  const widthM = (bounds.east - bounds.west) * metresPerDegLon(centreLat);
  const heightM = (bounds.north - bounds.south) * METRES_PER_DEG_LAT;
  const stepM = niceNumber(Math.max(widthM, heightM) / targetLines);
  return stepM > 0 ? stepM / METRES_PER_DEG_LAT : 0;
}

/** Decimal places needed so neighbouring grid labels differ, for example 0.0084° -> 4. */
export function decimalsForStep(stepDeg: number): number {
  if (!(stepDeg > 0)) return 2;
  return Math.min(7, Math.max(2, Math.ceil(-Math.log10(stepDeg)) + 1));
}

export interface GridLines {
  /** Longitudes of meridians inside the bounds. */
  lons: number[];
  /** Latitudes of parallels inside the bounds. */
  lats: number[];
}

const MAX_GRID_LINES = 40;

export function gridLines(bounds: Bounds, stepDeg: number): GridLines {
  if (!(stepDeg > 0)) return { lons: [], lats: [] };
  const range = (from: number, to: number): number[] => {
    const out: number[] = [];
    const first = Math.ceil(from / stepDeg);
    const last = Math.floor(to / stepDeg);
    if (last - first > MAX_GRID_LINES) return out; // zoomed too far out for a useful grid
    // Multiply instead of accumulating to avoid float drift over many lines.
    for (let i = first; i <= last; i += 1) out.push(i * stepDeg);
    return out;
  };
  return { lons: range(bounds.west, bounds.east), lats: range(bounds.south, bounds.north) };
}

export interface PathProjection {
  /** 0..1 along the path by length. */
  fraction: number;
  /** Distance from the query point to the path, metres. */
  offsetM: number;
  point: LonLat;
}

/** Cumulative length at each vertex of a path, metres. First value is 0. */
export function cumulativeLengths(path: readonly LonLat[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1];
    const cur = path[i];
    out.push((out[i - 1] ?? 0) + (prev && cur ? haversine(prev, cur) : 0));
  }
  return out;
}

function lerpLonLat(a: LonLat, b: LonLat, t: number): LonLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** The part of a path between two fractions (0..1) of its length, vertices included. */
export function slicePath(path: readonly LonLat[], fromFraction: number, toFraction: number): LonLat[] {
  const first = path[0];
  if (!first) return [];
  if (path.length === 1) return [first];
  const lengths = cumulativeLengths(path);
  const total = lengths[lengths.length - 1] ?? 0;
  if (total <= 0) return [first];

  const clamp = (f: number) => Math.min(1, Math.max(0, f));
  const lo = clamp(Math.min(fromFraction, toFraction)) * total;
  const hi = clamp(Math.max(fromFraction, toFraction)) * total;

  const at = (dist: number): LonLat => {
    for (let i = 1; i < path.length; i += 1) {
      const l1 = lengths[i] ?? 0;
      if (dist <= l1 || i === path.length - 1) {
        const l0 = lengths[i - 1] ?? 0;
        const a = path[i - 1] ?? first;
        const b = path[i] ?? first;
        return lerpLonLat(a, b, l1 > l0 ? Math.min(1, Math.max(0, (dist - l0) / (l1 - l0))) : 0);
      }
    }
    return first;
  };

  const out: LonLat[] = [at(lo)];
  for (let i = 1; i < path.length - 1; i += 1) {
    const l = lengths[i] ?? 0;
    const v = path[i];
    if (v && l > lo && l < hi) out.push(v);
  }
  out.push(at(hi));
  return out;
}

/** Point at a fraction (0..1) of the path length, plus the local bearing. */
export function pointAtFraction(
  path: readonly LonLat[],
  fraction: number,
  lengths: readonly number[] = cumulativeLengths(path),
): { point: LonLat; bearingDeg: number } | null {
  const first = path[0];
  if (!first) return null;
  if (path.length === 1) return { point: first, bearingDeg: 0 };
  const total = lengths[lengths.length - 1] ?? 0;
  const target = Math.min(1, Math.max(0, fraction)) * total;
  for (let i = 1; i < path.length; i += 1) {
    const l0 = lengths[i - 1] ?? 0;
    const l1 = lengths[i] ?? 0;
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    if (target <= l1 || i === path.length - 1) {
      const t = l1 > l0 ? Math.min(1, Math.max(0, (target - l0) / (l1 - l0))) : 0;
      return {
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        bearingDeg: bearing(a, b),
      };
    }
  }
  return { point: first, bearingDeg: 0 };
}

/** Nearest point on a path to a query point (local flat approximation). */
export function projectOnPath(path: readonly LonLat[], query: LonLat): PathProjection | null {
  if (path.length === 0) return null;
  const lengths = cumulativeLengths(path);
  const total = lengths[lengths.length - 1] ?? 0;
  const mLon = metresPerDegLon(query[1]);
  let best: PathProjection | null = null;

  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    const ax = (a[0] - query[0]) * mLon;
    const ay = (a[1] - query[1]) * METRES_PER_DEG_LAT;
    const bx = (b[0] - query[0]) * mLon;
    const by = (b[1] - query[1]) * METRES_PER_DEG_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
    const px = ax + dx * t;
    const py = ay + dy * t;
    const offsetM = Math.hypot(px, py);
    if (!best || offsetM < best.offsetM) {
      const l0 = lengths[i - 1] ?? 0;
      const l1 = lengths[i] ?? 0;
      best = {
        offsetM,
        fraction: total > 0 ? (l0 + (l1 - l0) * t) / total : 0,
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      };
    }
  }
  const only = path[0];
  if (!best && only) {
    return { fraction: 0, offsetM: haversine(only, query), point: only };
  }
  return best;
}

/** Mean of the outer ring's vertices; good enough to anchor a label on a small polygon. */
export function ringCentroid(ring: readonly LonLat[]): LonLat | null {
  // Drop the closing vertex so it is not counted twice.
  const pts = ring.length > 1 && ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1]
    ? ring.slice(0, -1)
    : ring;
  if (pts.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / pts.length, sy / pts.length];
}
