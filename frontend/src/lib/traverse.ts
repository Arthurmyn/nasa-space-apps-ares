import type { SiteGrid } from "../api/types.ts";
import { gridCellIndex } from "./siteGeo.ts";

/** One Curiosity (MSL) stop from the NASA MMGIS waypoint list. */
export interface TraverseStop {
  lon: number;
  lat: number;
  sol: number;
  site: number;
  drive: number;
  /** Rover-measured tilt, degrees. */
  tilt: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Stops in drive order: by sol, then site, then drive (RMC). */
export function compareStops(a: TraverseStop, b: TraverseStop): number {
  return a.sol - b.sol || a.site - b.site || a.drive - b.drive;
}

/**
 * Read traverse.geojson (a FeatureCollection of Points with sol, site, drive, tilt) into stops
 * sorted in drive order. Features without a point or a sol, site and drive are skipped.
 */
export function parseTraverse(json: unknown): TraverseStop[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const stops: TraverseStop[] = [];
  for (const f of features) {
    const geom = (f as { geometry?: { type?: unknown; coordinates?: unknown } })?.geometry;
    const props = ((f as { properties?: unknown })?.properties ?? {}) as Record<string, unknown>;
    if (geom?.type !== "Point" || !Array.isArray(geom.coordinates)) continue;
    const lon = num(geom.coordinates[0]);
    const lat = num(geom.coordinates[1]);
    const sol = num(props.sol);
    const site = num(props.site);
    const drive = num(props.drive);
    if (lon === null || lat === null || sol === null || site === null || drive === null) continue;
    stops.push({ lon, lat, sol, site, drive, tilt: num(props.tilt) });
  }
  return stops.sort(compareStops);
}

/**
 * Slope in degrees of the grid cell under (lon, lat): slope.bin byte times slope_unit_deg.
 * Null outside the grid, on a no-data cell, or when slope.bin is not loaded.
 */
export function slopeAt(
  g: SiteGrid,
  centre: { lon: number; lat: number },
  slope: Uint8Array | null,
  lon: number,
  lat: number,
): number | null {
  if (!slope) return null;
  const i = gridCellIndex(g, centre, lon, lat);
  const code = i === null ? undefined : slope[i];
  if (code === undefined || code === g.slope_nodata) return null;
  return code * g.slope_unit_deg;
}

/** "Sol 4612 · rover tilt 9.0° · slope here 6.0°" */
export function traverseTooltip(stop: Pick<TraverseStop, "sol" | "tilt">, slopeDeg: number | null): string {
  const tilt = stop.tilt === null ? "n/a" : `${stop.tilt.toFixed(1)}°`;
  const slope = slopeDeg === null ? "no data" : `${slopeDeg.toFixed(1)}°`;
  return `Sol ${stop.sol} · rover tilt ${tilt} · slope here ${slope}`;
}
