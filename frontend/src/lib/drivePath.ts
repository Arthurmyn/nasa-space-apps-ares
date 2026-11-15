import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import type { GridBbox, LonLat } from "../api/types.ts";
import { haversine } from "./geo.ts";

/** Curiosity's whole drive near the sites, from the NASA traverse file: public/data/msl_traverse.json, made by scripts/fetch_traverse.py (docs/DATA_CONTRACT.md, section 10). */
export interface DrivePath {
  lines: LonLat[][];
  source: { title: string; url: string; fetchedUtc: string | null };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads the file; a document that does not match the contract is an error, never half drawn. */
export function parseDrivePath(raw: unknown): DrivePath {
  if (!isObj(raw) || !isObj(raw.ares) || raw.ares.schema !== "ares.traverse/v1") throw new Error("Not an ares.traverse/v1 file");
  const features = raw.features;
  const geometry = Array.isArray(features) && isObj(features[0]) && isObj(features[0].geometry) ? features[0].geometry : null;
  if (!geometry || geometry.type !== "MultiLineString" || !Array.isArray(geometry.coordinates)) throw new Error("The traverse has no MultiLineString");
  const lines = geometry.coordinates.map((line, i) => {
    if (!Array.isArray(line) || line.length < 2) throw new Error(`Line ${i} has fewer than 2 points`);
    return line.map((p, j): LonLat => {
      const lon = Array.isArray(p) ? p[0] : NaN;
      const lat = Array.isArray(p) ? p[1] : NaN;
      if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new Error(`Point ${i}.${j} is not a [lon, lat]`);
      }
      return [lon, lat];
    });
  });
  if (lines.length === 0) throw new Error("The traverse has no lines");
  const src = isObj(raw.ares.source) ? raw.ares.source : {};
  const url = typeof src.url === "string" && /^https?:\/\//.test(src.url) ? src.url : "";
  return {
    lines,
    source: { title: typeof src.title === "string" ? src.title : "MSL traverse", url, fetchedUtc: typeof src.fetched_utc === "string" ? src.fetched_utc : null },
  };
}

export interface BboxRelation {
  /** True when any vertex lies inside the box. */
  inside: boolean;
  /** The traverse vertex closest to the box, and the distance to it in metres (0 when inside). */
  nearest: { point: LonLat; distanceM: number };
}

/** How the traverse sits against a site: whether it enters the box, and the nearest vertex if it does not. */
export function relateToBbox(lines: readonly (readonly LonLat[])[], box: GridBbox): BboxRelation {
  let best: LonLat | null = null;
  let bestD = Infinity;
  let inside = false;
  for (const line of lines) {
    for (const p of line) {
      const cx = Math.min(Math.max(p[0], box.lon_min), box.lon_max);
      const cy = Math.min(Math.max(p[1], box.lat_min), box.lat_max);
      const d = cx === p[0] && cy === p[1] ? 0 : haversine(p, [cx, cy]);
      if (d === 0) inside = true;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  if (!best) throw new Error("The traverse has no vertices");
  return { inside, nearest: { point: best, distanceM: bestD } };
}

export function drivePathFeatures(t: DrivePath): FeatureCollection {
  const feature: Feature<MultiLineString> = {
    type: "Feature",
    properties: { name: "Curiosity drive path" },
    geometry: { type: "MultiLineString", coordinates: t.lines.map((l) => l.map(([lon, lat]) => [lon, lat])) },
  };
  return { type: "FeatureCollection", features: [feature] };
}
