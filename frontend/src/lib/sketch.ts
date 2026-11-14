import type { LonLat } from "../api/types.ts";
import { METRES_PER_DEG_LAT } from "./geo.ts";

export interface SketchProjection {
  /** Longitude/latitude to SVG user units (y grows downward). */
  project: (p: LonLat) => [x: number, y: number];
  /** Ground metres per SVG unit, for the scale bar. */
  metresPerUnit: number;
}

/**
 * Fit a set of points into a width x height box with padding, keeping the true aspect
 * ratio (longitude is scaled by cos(latitude)). North is up. Used for printable maps, where
 * a vector sketch is sharper and lighter than a WebGL canvas snapshot.
 */
export function fitSketch(
  points: readonly LonLat[],
  width: number,
  height: number,
  padding: number,
): SketchProjection | null {
  if (points.length === 0 || width <= 2 * padding || height <= 2 * padding) return null;

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = (maxLon - minLon) * kx;
  const spanY = maxLat - minLat;
  const availW = width - 2 * padding;
  const availH = height - 2 * padding;

  // A single point (or a perfectly horizontal/vertical line) has a zero span; use a fixed scale.
  const scale =
    spanX > 0 && spanY > 0 ? Math.min(availW / spanX, availH / spanY) : spanX > 0 ? availW / spanX : spanY > 0 ? availH / spanY : 1e5;

  const offsetX = padding + (availW - spanX * scale) / 2;
  const offsetY = padding + (availH - spanY * scale) / 2;

  return {
    project: ([lon, lat]) => [offsetX + (lon - minLon) * kx * scale, offsetY + (maxLat - lat) * scale],
    metresPerUnit: METRES_PER_DEG_LAT / scale,
  };
}
