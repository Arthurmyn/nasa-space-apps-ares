// Frontend proposal for the route-planning contract. docs/api.md defines no route
// endpoints yet, so these shapes are a PROPOSAL; see "Frontend proposal" in docs/api.md.
// When the backend Pydantic schemas land, mirror them here and update that section.

/** [longitude, latitude] in degrees, same order as GeoJSON. East-positive, range -180..180. */
export type LonLat = readonly [lon: number, lat: number];

export type SafetyLevel = "ok" | "caution" | "avoid";

export type LayerId = "slope" | "optical" | "thermal" | "geology" | "radiation";

export const LAYER_IDS: readonly LayerId[] = ["slope", "optical", "thermal", "geology", "radiation"];

export interface GeoJsonPolygon {
  type: "Polygon";
  /** First ring is the outer boundary; closed (first point equals last point). */
  coordinates: LonLat[][];
}

// ---- GET /layers -----------------------------------------------------------

export interface LayerInfo {
  id: LayerId;
  /** False when the API has no data for this layer at this site. */
  available: boolean;
  /** Plain-language reason shown when `available` is false. */
  reason: string | null;
  /** Dataset name and provider, shown in the layer legend. */
  source: string | null;
}

export interface LayersResponse {
  layers: LayerInfo[];
}

// ---- POST /route -----------------------------------------------------------

export interface PointInput {
  /** Client-generated stable id ("start", "stop-1", ...). The backend echoes it on the stop. */
  id: string;
  lon: number;
  lat: number;
  /** Optional user-given name; the backend echoes it back on the stop. */
  name?: string;
}

/** Route cost profile (docs/api.md): "balanced" is the default and the original cost. */
export type RouteProfileId = "fast" | "balanced" | "safe";
export const ROUTE_PROFILE_IDS: readonly RouteProfileId[] = ["fast", "balanced", "safe"];

export interface RouteRequest {
  /** Which site's terrain to plan on; the backend uses its default site when omitted. */
  site_id?: string;
  start: PointInput;
  /** Ordered science stops, 1 to MAX_STOPS. */
  stops: PointInput[];
  constraints: { max_slope_deg: number };
  /** Cost profile. Left out for "balanced", so an older backend sees the request it knows. */
  profile?: RouteProfileId;
  /** Ask for one alternative route in `alternative`. */
  compare?: boolean;
  /** Planned minutes at each stop, added to the EVA time. Left out for 0. */
  stop_time_min?: number;
}

export interface StopImage {
  url: string;
  alt: string;
  /** Credit line, for example the instrument and team. */
  credit: string;
}

export interface RouteStop {
  /** Echo of the request point id. The map label (A, B, ...) is derived from order on the client. */
  id: string;
  /** Display name. Null when the request gave none; the UI then shows "Stop A". */
  name: string | null;
  lon: number;
  lat: number;
  /** Distance along the route at which this stop is reached, metres. */
  dist_m: number;
  /** Short science note. Null when the backend has none. */
  note: string | null;
  image: StopImage | null;
}

export type HazardKind = "rough_terrain" | "sand_trap" | "steep_slope" | "other";

export interface HazardZone {
  id: string;
  kind: HazardKind;
  /** Short label drawn on the map, for example "Rough terrain". */
  label: string;
  polygon: GeoJsonPolygon;
}

export interface ProfilePoint {
  /** Distance along the route from the start, metres. Strictly increasing. */
  dist_m: number;
  elev_m: number;
  /** Absolute local slope at this sample, degrees (0 or more). */
  slope_deg: number;
}

export interface Assumption {
  name: string;
  value: string;
  /** Dataset, model or document the value comes from. */
  source: string;
}

export interface RouteAlternative {
  distance_m: number;
  max_slope_deg: number;
  est_time_s: number;
  polyline: LonLat[];
}

export interface RouteNavigation {
  /** Exact cumulative route distance for each polyline vertex, in backend metres. */
  vertex_dist_m: number[];
  /** For each edge, the index of the geometry edge that supplies its heading. */
  heading_segments: number[];
}

/**
 * How ready the route is for an EVA. NOT_ADVISED: no path, or the round trip is over the EVA limit.
 * MARGINAL: steeper than the caution slope, or the safe profile fell back. Otherwise NOMINAL.
 */
export type ReadinessLevel = "NOMINAL" | "MARGINAL" | "NOT_ADVISED";

/**
 * The older name for the same judgement, still sent next to `readiness` for older clients:
 * "GO", "CAUTION" or "NO-GO". The web app reads `readiness` and never shows this value.
 */
export type LegacyStatus = "GO" | "CAUTION" | "NO-GO";

export interface Readiness {
  level: ReadinessLevel;
  /** Plain sentences behind the level. */
  reasons: string[];
}

/** Share of the distance in each slope class, in percent; the three add up to 100. */
export interface SlopeClassPct {
  ok: number;
  caution: number;
  avoid: number;
}

export interface RouteStats {
  slope_class_pct: SlopeClassPct;
  climb_m: number;
  descent_m: number;
}

/** The walk back along the same stops, reversed. */
export interface ReturnTrip {
  distance_m: number;
  est_time_s: number;
}

/** Longest shortest walkable way back to the start from any route point. */
export interface ReturnCheck {
  ok: boolean;
  worst_return_m: number;
  worst_return_s: number;
  /** The route point with the longest walk back. */
  worst_point: LonLat;
  /** Where that point is along the route, metres from the start. */
  worst_route_dist_m: number;
  limit_m: number | null;
  limit_s: number | null;
}

export interface RouteResponse {
  /** ISO 8601 UTC timestamp of when the backend computed this route. */
  computed_at: string;
  distance_m: number;
  max_slope_deg: number;
  est_time_s: number;
  safety: SafetyLevel;
  /** One plain-language sentence explaining the safety status. */
  safety_reason: string;
  /** Route geometry from start through every stop. */
  polyline: LonLat[];
  /** Echo of the request stops, in order, enriched with distance, note and image. */
  stops: RouteStop[];
  hazards: HazardZone[];
  profile: ProfilePoint[];
  assumptions: Assumption[];
  /** Present only when the request set `compare: true` and the backend found one. */
  alternative: RouteAlternative | null;
  /** Missing on legacy responses; use the raw geometric tangent in that case. */
  navigation?: RouteNavigation | null;
  /** Route-service capability, independent of layer-list availability. */
  supports_alternatives?: boolean;
  // Added with route profiles. All optional: an older backend does not send them.
  route_profile?: RouteProfileId;
  /** True when "safe" found no path under the caution threshold and the normal limit was used. */
  profile_fallback?: boolean;
  stats?: RouteStats;
  /** Null when there is no path back. */
  return?: ReturnTrip | null;
  round_trip_time_s?: number | null;
  /** The EVA time limit behind `status`, seconds. Null when the site has none. */
  eva_limit_s?: number | null;
  readiness?: Readiness;
  /** Legacy fields, kept in the type for older clients and old saved responses. Not shown anywhere. */
  status?: LegacyStatus;
  // Added with the return check. Optional: an older backend does not send them.
  /** Null when the site sets no return limit. */
  return_check?: ReturnCheck | null;
  /** Time at stops: stop count × stop_time_min. */
  stops_time_s?: number;
  /** Round trip + time at stops, the number checked against `eva_limit_s`. Null with no path back. */
  eva_time_s?: number | null;
  reasons?: string[];
}

// ---- POST /route/sensitivity -----------------------------------------------

export interface SensitivityResult {
  limit_deg: number;
  reachable: boolean;
  distance_m: number | null;
  est_time_s: number | null;
  max_slope_deg: number | null;
  /** Why the plan fails at this limit; null when it is reachable. */
  reason: string | null;
}

export interface SensitivityResponse {
  site_id: string;
  results: SensitivityResult[];
}

// ---- GET /conditions -------------------------------------------------------

/** Curiosity REMS weather at the rover's own position (newest sol). A value the feed lacks is null. */
export interface ConditionsData {
  available: true;
  provider: string;
  /** The feed's own terms, shown with the data. */
  disclaimer: string;
  source_url: string;
  sol: number | null;
  earth_date: string | null;
  ls_deg: number | null;
  season: string | null;
  air_temp_min_c: number | null;
  air_temp_max_c: number | null;
  ground_temp_min_c: number | null;
  ground_temp_max_c: number | null;
  pressure_pa: number | null;
  pressure_note: string | null;
  sunrise: string | null;
  sunset: string | null;
  uv_index: string | null;
  opacity: string | null;
  wind_speed: number | null;
  fetched_at: string | null;
}

export type ConditionsResponse = ConditionsData | { available: false; reason: string };

// ---- Site data: docs/DATA_CONTRACT.md -----------------------------------------

export interface GridBbox {
  lon_min: number;
  lon_max: number;
  lat_min: number;
  lat_max: number;
}

/** /app/data/<site_id>/meta.json, the parts the frontend uses (contract section 3). */
export interface SiteMeta {
  site_id: string;
  name: string;
  preliminary: boolean;
  /** True for generated test grids. The UI shows a "Test data" badge. */
  is_test_data: boolean;
  center: { lon: number; lat: number };
  bbox: GridBbox;
  /** Dataset credits, shown under "How this is computed". */
  sources: string[];
  /** Terrain model behind the grid, for the printed card. Null when meta.json does not say. */
  dtm_product_id: string | null;
  /** Grid cell size and slope smoothing window, metres. */
  cell_m: number | null;
  slope_window_m: number | null;
  /** Grid geometry for reading slope.bin (contract section 4). Missing in older meta.json files. */
  grid?: SiteGrid | null;
}

export interface SiteGrid {
  width: number;
  height: number;
  cell_m: number;
  x_min_m: number;
  y_max_m: number;
  mars_radius_m: number;
  slope_unit_deg: number;
  slope_nodata: number;
}

export interface SiteStop {
  id: string;
  name: string;
  lon: number;
  lat: number;
  note: string | null;
  image: StopImage | null;
  source_id: string | null;
}

export interface StopGroup {
  id: string;
  name: string;
  stop_ids: string[];
}

/** One entry of GET /sites (contract section 7). */
export interface ContextSource {
  title: string;
  url: string;
  credit: string;
}

/** Short science context for a site, with the pages it comes from (stops.json "context"). */
export interface SiteContextInfo {
  title: string;
  text: string;
  sources: ContextSource[];
}

export interface SiteEntry {
  id: string;
  name: string;
  groups: StopGroup[];
  stops: SiteStop[];
  /** Null when the site has none. */
  context: SiteContextInfo | null;
}

export interface SitesResponse {
  sites: SiteEntry[];
}

/** /app/data/<site>/thermal.json: what the thermal layer image shows, for its legend and credit. */
export interface ThermalInfo {
  nativePixelM: number;
  dnMin: number;
  dnMax: number;
  /** Colormap stops from low (0) to high (1), as [position, "#rrggbb"]. */
  stops: ReadonlyArray<readonly [number, string]>;
  observationStartUtc: string | null;
  productId: string | null;
}

// ---- Client-side error model ----------------------------------------------

export type ApiErrorKind = "network" | "timeout" | "http" | "invalid" | "aborted";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /**
   * Reason text from a 422 answer (`{"detail": "..."}`, docs/DATA_CONTRACT.md section 7): the API
   * writes it for the user. Null for every other error.
   */
  readonly detail: string | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, detail: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}
