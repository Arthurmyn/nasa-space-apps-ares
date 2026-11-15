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

/**
 * The words that go with a unit, always: the map is a global one, and says so with its own scale (the
 * `scale` field of the answer, not a number typed here). Null when there is no unit to qualify.
 */
export function geologyCaveat(g: GeologyResponse | null): string | null {
  return g && g.available ? `Coarse global map (${g.scale}), not site-scale.` : null;
}

/**
 * When the site's whole file is one unit, the unit says nothing about this exact spot: it is the
 * region the site sits in. Said in words, so the result is not read as a detailed local mapping.
 */
export function geologyScope(g: GeologyResponse | null): string | null {
  return g && g.available && g.units_in_site === 1 ? "The whole site lies in this one unit, so it describes the region, not this spot." : null;
}
