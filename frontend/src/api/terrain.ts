import { ApiError } from "./types.ts";
import { siteFileUrl } from "./siteFiles.ts";
import { decodeElevation, elevationRange, type ElevationRange, type GridMeta } from "../lib/terrain.ts";

export interface Terrain {
  meta: GridMeta;
  elevation: Float32Array;
  range: ElevationRange;
  hillshadeUrl: string;
  slopeUrl: string;
}

const cache = new Map<string, Promise<Terrain>>();

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ApiError("invalid", `meta.${key} is not a number`);
  return v;
}

/** The terrain files of a site (public/data/<site>/): meta.json, elevation.bin and the two PNG layers. */
async function fetchTerrain(siteId: string): Promise<Terrain> {
  const metaRes = await fetch(siteFileUrl(siteId, "meta.json"));
  if (!metaRes.ok) throw new ApiError("http", `HTTP ${metaRes.status}`, metaRes.status);
  const raw = (await metaRes.json()) as Record<string, unknown>;
  const centre = raw.center as Record<string, unknown> | undefined;
  if (!centre) throw new ApiError("invalid", "meta.center is missing");
  const meta: GridMeta = {
    width: num(raw, "width"),
    height: num(raw, "height"),
    cellM: num(raw, "cell_m"),
    xMinM: num(raw, "x_min_m"),
    yMaxM: num(raw, "y_max_m"),
    radiusM: num(raw, "mars_radius_m"),
    centre: { lon: num(centre, "lon"), lat: num(centre, "lat") },
  };
  const res = await fetch(siteFileUrl(siteId, "elevation.bin"));
  if (!res.ok) throw new ApiError("http", `HTTP ${res.status}`, res.status);
  const elevation = decodeElevation(await res.arrayBuffer(), meta);
  if (!elevation) throw new ApiError("invalid", "elevation.bin does not match the grid size in meta.json");
  const range = elevationRange(elevation);
  if (!range) throw new ApiError("invalid", "elevation.bin has no valid cells");
  return { meta, elevation, range, hillshadeUrl: siteFileUrl(siteId, "hillshade.png"), slopeUrl: siteFileUrl(siteId, "slope.png") };
}

/** Loaded once per site and kept; a failed load is not cached so a retry can succeed. */
export function loadTerrain(siteId: string): Promise<Terrain> {
  let p = cache.get(siteId);
  if (!p) {
    p = fetchTerrain(siteId);
    p.catch(() => cache.delete(siteId));
    cache.set(siteId, p);
  }
  return p;
}
