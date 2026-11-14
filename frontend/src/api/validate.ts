import {
  ApiError,
  LAYER_IDS,
  type Assumption,
  type GeoJsonPolygon,
  type HazardKind,
  type HazardZone,
  type LayerId,
  type LayerInfo,
  type LayersResponse,
  type LonLat,
  type ProfilePoint,
  type RouteAlternative,
  type RouteResponse,
  type RouteNavigation,
  type RouteStop,
  type SafetyLevel,
  type SiteEntry,
  type SiteMeta,
  type SiteStop,
  type SitesResponse,
  type StopGroup,
  type StopImage,
  type ThermalInfo,
} from "./types.ts";

// Runtime checks at the network boundary. A response that does not match the contract is
// rejected as "invalid" instead of crashing a component later.

type Obj = Record<string, unknown>;

const fail = (path: string, expected: string): never => {
  throw new ApiError("invalid", `Invalid response: ${path} should be ${expected}`);
};

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function obj(v: unknown, path: string): Obj {
  return isObj(v) ? v : fail(path, "an object");
}

function arr(v: unknown, path: string): unknown[] {
  return Array.isArray(v) ? v : fail(path, "an array");
}

function num(v: unknown, path: string): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fail(path, "a finite number");
}

function str(v: unknown, path: string): string {
  return typeof v === "string" ? v : fail(path, "a string");
}

function strOrNull(v: unknown, path: string): string | null {
  return v === null || v === undefined ? null : str(v, path);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fail(path, `one of ${allowed.join(", ")}`);
}

function lonLat(v: unknown, path: string): LonLat {
  const a = arr(v, path);
  if (a.length < 2) fail(path, "[lon, lat]");
  const lon = num(a[0], `${path}[0]`);
  const lat = num(a[1], `${path}[1]`);
  if (lat < -90 || lat > 90) fail(path, "a latitude between -90 and 90");
  return [lon, lat];
}

function polygon(v: unknown, path: string): GeoJsonPolygon {
  const o = obj(v, path);
  if (o.type !== "Polygon") fail(`${path}.type`, '"Polygon"');
  const rings = arr(o.coordinates, `${path}.coordinates`).map((ring, i) =>
    arr(ring, `${path}.coordinates[${i}]`).map((p, j) => lonLat(p, `${path}.coordinates[${i}][${j}]`)),
  );
  if (rings.length === 0 || (rings[0]?.length ?? 0) < 4) fail(`${path}.coordinates`, "a closed ring of 4+ points");
  return { type: "Polygon", coordinates: rings };
}

export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const SAFETY: readonly SafetyLevel[] = ["ok", "caution", "avoid"];
const HAZARD_KINDS: readonly HazardKind[] = ["rough_terrain", "sand_trap", "steep_slope", "other"];

function stopImage(v: unknown, path: string): StopImage | null {
  if (v === null || v === undefined) return null;
  const i = obj(v, path);
  const url = str(i.url, `${path}.url`);
  // Only http(s) may reach an <img src>; javascript:, data: and the like are dropped.
  if (!isHttpUrl(url)) return null;
  return { url, alt: str(i.alt, `${path}.alt`), credit: str(i.credit, `${path}.credit`) };
}

function stop(v: unknown, path: string): RouteStop {
  const o = obj(v, path);
  const image = stopImage(o.image, `${path}.image`);
  return {
    id: str(o.id, `${path}.id`),
    name: strOrNull(o.name, `${path}.name`),
    lon: num(o.lon, `${path}.lon`),
    lat: num(o.lat, `${path}.lat`),
    dist_m: num(o.dist_m, `${path}.dist_m`),
    note: strOrNull(o.note, `${path}.note`),
    image,
  };
}

function hazard(v: unknown, path: string): HazardZone {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    kind: oneOf(o.kind, HAZARD_KINDS, `${path}.kind`),
    label: str(o.label, `${path}.label`),
    polygon: polygon(o.polygon, `${path}.polygon`),
  };
}

function profilePoint(v: unknown, path: string): ProfilePoint {
  const o = obj(v, path);
  return {
    dist_m: num(o.dist_m, `${path}.dist_m`),
    elev_m: num(o.elev_m, `${path}.elev_m`),
    slope_deg: Math.abs(num(o.slope_deg, `${path}.slope_deg`)),
  };
}

function assumption(v: unknown, path: string): Assumption {
  const o = obj(v, path);
  return { name: str(o.name, `${path}.name`), value: str(o.value, `${path}.value`), source: str(o.source, `${path}.source`) };
}

function alternative(v: unknown, path: string): RouteAlternative | null {
  if (v === null || v === undefined) return null;
  const o = obj(v, path);
  return {
    distance_m: num(o.distance_m, `${path}.distance_m`),
    max_slope_deg: num(o.max_slope_deg, `${path}.max_slope_deg`),
    est_time_s: num(o.est_time_s, `${path}.est_time_s`),
    polyline: arr(o.polyline, `${path}.polyline`).map((p, i) => lonLat(p, `${path}.polyline[${i}]`)),
  };
}

function navigation(v: unknown, polyline: readonly LonLat[], distance: number): RouteNavigation | null {
  if (v === undefined || v === null) return null;
  const n = obj(v, "navigation");
  const distances = arr(n.vertex_dist_m, "navigation.vertex_dist_m").map((d) => num(d, "navigation.vertex_dist_m"));
  const refs = arr(n.heading_segments, "navigation.heading_segments").map((r) => num(r, "navigation.heading_segments"));
  if (distances.length !== polyline.length || distances[0] !== 0 || distances[distances.length - 1] !== distance) {
    fail("navigation.vertex_dist_m", "one exact cumulative distance per vertex, from 0 to distance_m");
  }
  for (let i = 1; i < distances.length; i += 1) {
    const a = distances[i - 1]!;
    const b = distances[i]!;
    const samePoint = polyline[i - 1]![0] === polyline[i]![0] && polyline[i - 1]![1] === polyline[i]![1];
    if (b < a || (b === a && !samePoint)) fail("navigation.vertex_dist_m", "increasing along moving edges");
  }
  if (refs.length !== polyline.length - 1) fail("navigation.heading_segments", "one reference per edge");
  for (const ref of refs) {
    if (!Number.isInteger(ref) || ref < 0 || ref >= refs.length || refs[ref] !== ref ||
        (distance > 0 && distances[ref + 1]! <= distances[ref]!)) {
      fail("navigation.heading_segments", "indices of nonzero canonical heading edges");
    }
  }
  return { vertex_dist_m: distances, heading_segments: refs };
}

/** Navigation is HUD-only metadata: a malformed block is dropped and the route stays usable. */
function optionalNavigation(v: unknown, polyline: readonly LonLat[], distance: number): RouteNavigation | null {
  try {
    return navigation(v, polyline, distance);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.warn(`Ignoring route navigation metadata. ${e.message}`);
    return null;
  }
}

export function parseRouteResponse(raw: unknown): RouteResponse {
  const o = obj(raw, "response");
  const polyline = arr(o.polyline, "polyline").map((p, i) => lonLat(p, `polyline[${i}]`));
  if (polyline.length < 2) fail("polyline", "at least 2 points");
  const distance = num(o.distance_m, "distance_m");
  if (o.supports_alternatives !== undefined && typeof o.supports_alternatives !== "boolean") {
    fail("supports_alternatives", "a boolean");
  }

  const profile = arr(o.profile, "profile").map((p, i) => profilePoint(p, `profile[${i}]`));
  for (let i = 1; i < profile.length; i += 1) {
    if ((profile[i]?.dist_m ?? 0) <= (profile[i - 1]?.dist_m ?? 0)) fail("profile", "strictly increasing in dist_m");
  }

  return {
    computed_at: str(o.computed_at, "computed_at"),
    distance_m: distance,
    max_slope_deg: num(o.max_slope_deg, "max_slope_deg"),
    est_time_s: num(o.est_time_s, "est_time_s"),
    safety: oneOf(o.safety, SAFETY, "safety"),
    safety_reason: str(o.safety_reason, "safety_reason"),
    polyline,
    stops: arr(o.stops, "stops").map((s, i) => stop(s, `stops[${i}]`)),
    hazards: arr(o.hazards, "hazards").map((h, i) => hazard(h, `hazards[${i}]`)),
    profile,
    assumptions: arr(o.assumptions, "assumptions").map((a, i) => assumption(a, `assumptions[${i}]`)),
    alternative: alternative(o.alternative, "alternative"),
    navigation: optionalNavigation(o.navigation, polyline, distance),
    supports_alternatives: o.supports_alternatives === true,
  };
}

export function parseLayersResponse(raw: unknown): LayersResponse {
  const o = obj(raw, "response");
  const layers: LayerInfo[] = arr(o.layers, "layers").map((l, i) => {
    const p = obj(l, `layers[${i}]`);
    if (typeof p.available !== "boolean") fail(`layers[${i}].available`, "a boolean");
    return {
      id: oneOf<LayerId>(p.id, LAYER_IDS, `layers[${i}].id`),
      available: p.available === true,
      reason: strOrNull(p.reason, `layers[${i}].reason`),
      source: strOrNull(p.source, `layers[${i}].source`),
    };
  });
  return { layers };
}

const latitude = (v: unknown, path: string): number => {
  const n = num(v, path);
  return n < -90 || n > 90 ? fail(path, "a latitude between -90 and 90") : n;
};

export function parseSiteMeta(raw: unknown): SiteMeta {
  const o = obj(raw, "meta");
  const c = obj(o.center, "meta.center");
  const b = obj(o.bbox, "meta.bbox");
  const bbox = {
    lon_min: num(b.lon_min, "meta.bbox.lon_min"),
    lon_max: num(b.lon_max, "meta.bbox.lon_max"),
    lat_min: latitude(b.lat_min, "meta.bbox.lat_min"),
    lat_max: latitude(b.lat_max, "meta.bbox.lat_max"),
  };
  if (bbox.lon_min >= bbox.lon_max || bbox.lat_min >= bbox.lat_max) fail("meta.bbox", "a box with min below max");
  return {
    site_id: str(o.site_id, "meta.site_id"),
    name: str(o.name, "meta.name"),
    preliminary: o.preliminary === true,
    is_test_data: o.is_test_data === true,
    center: { lon: num(c.lon, "meta.center.lon"), lat: latitude(c.lat, "meta.center.lat") },
    bbox,
    sources: arr(o.sources ?? [], "meta.sources").map((s, i) => str(s, `meta.sources[${i}]`)),
    dtm_product_id: strOrNull(o.dtm_product_id, "meta.dtm_product_id"),
    cell_m: o.cell_m === undefined ? null : num(o.cell_m, "meta.cell_m"),
    slope_window_m: o.slope_window_m === undefined ? null : num(o.slope_window_m, "meta.slope_window_m"),
  };
}

function siteStop(v: unknown, path: string): SiteStop {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`),
    lon: num(o.lon, `${path}.lon`),
    lat: latitude(o.lat, `${path}.lat`),
    note: strOrNull(o.note, `${path}.note`),
    image: stopImage(o.image, `${path}.image`),
    source_id: strOrNull(o.source_id, `${path}.source_id`),
  };
}

function group(v: unknown, path: string): StopGroup {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`),
    stop_ids: arr(o.stop_ids, `${path}.stop_ids`).map((s, i) => str(s, `${path}.stop_ids[${i}]`)),
  };
}

export function parseSitesResponse(raw: unknown): SitesResponse {
  const o = obj(raw, "response");
  const sites: SiteEntry[] = arr(o.sites, "sites").map((v, i) => {
    const p = obj(v, `sites[${i}]`);
    return {
      id: str(p.id, `sites[${i}].id`),
      name: str(p.name, `sites[${i}].name`),
      groups: arr(p.groups, `sites[${i}].groups`).map((g, j) => group(g, `sites[${i}].groups[${j}]`)),
      stops: arr(p.stops, `sites[${i}].stops`).map((s, j) => siteStop(s, `sites[${i}].stops[${j}]`)),
    };
  });
  return { sites };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function parseThermalInfo(raw: unknown): ThermalInfo {
  const o = obj(raw, "thermal");
  if (o.schema !== "ares.thermal/v1") fail("thermal.schema", '"ares.thermal/v1"');
  const value = obj(o.value, "thermal.value");
  const source = obj(o.source, "thermal.source");
  const stops = arr(obj(o.colormap, "thermal.colormap").stops, "thermal.colormap.stops").map((s, i) => {
    const pair = arr(s, `thermal.colormap.stops[${i}]`);
    const color = str(pair[1], `thermal.colormap.stops[${i}][1]`);
    if (!HEX_COLOR.test(color)) fail(`thermal.colormap.stops[${i}][1]`, "a #rrggbb colour");
    return [num(pair[0], `thermal.colormap.stops[${i}][0]`), color] as const;
  });
  if (stops.length < 2) fail("thermal.colormap.stops", "at least 2 stops");
  return {
    nativePixelM: num(o.native_pixel_m, "thermal.native_pixel_m"),
    dnMin: num(value.site_dn_min, "thermal.value.site_dn_min"),
    dnMax: num(value.site_dn_max, "thermal.value.site_dn_max"),
    stops,
    observationStartUtc: strOrNull(source.observation_start_utc, "thermal.source.observation_start_utc"),
    productId: strOrNull(source.product_id, "thermal.source.product_id"),
  };
}
