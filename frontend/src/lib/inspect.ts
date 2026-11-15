import type { GeologyResponse, SiteGrid } from "../api/types.ts";
import { lonLatToLocal, sampleElevation, type GridMeta } from "./terrain.ts";
import { slopeAt } from "./traverse.ts";

export interface TerrainAt {
  /** Metres, or null outside the grid or on a no-data cell. */
  elevationM: number | null;
  /** Degrees, or null when slope.bin has no value there. */
  slopeDeg: number | null;
}

/** Elevation and slope under a clicked point. Each is null when the site has no value there. */
export function terrainAt(
  meta: GridMeta | null,
  elevation: Float32Array | null,
  grid: SiteGrid | null,
  centre: { lon: number; lat: number },
  slope: Uint8Array | null,
  lon: number,
  lat: number,
): TerrainAt {
  let elevationM: number | null = null;
  if (meta && elevation) {
    const { x, y } = lonLatToLocal(meta, lon, lat);
    elevationM = sampleElevation(meta, elevation, x, y);
  }
  return { elevationM, slopeDeg: grid ? slopeAt(grid, centre, slope, lon, lat) : null };
}

/** "Htu, Hesperian transition undivided unit", or "No data" when the map has nothing at the point. */
export function geologyLabel(g: GeologyResponse | null): string {
  return g && g.available ? `${g.unit}, ${g.name}` : "No data";
}

/** What the geology row must always carry: the map is a global one, so it says so. */
export const GEOLOGY_CAVEAT = "Coarse global map, not site-scale.";
