// SAMPLE DATA ONLY. Loaded only when VITE_USE_MOCK=true; the UI then shows a "Sample data"
// badge. The terrain is a synthetic sine-wave surface and every value below is derived
// from the request geometry. None of it describes real Martian terrain.
import { SLOPE_LIMITS } from "../config/route.ts";
import { NO_DATA_REASON } from "../config/layers.ts";
import { METRES_PER_DEG_LAT, haversine, metresPerDegLon, offsetLonLat } from "../lib/geo.ts";
import { classifySlope } from "../lib/slope.ts";
import {
  ApiError,
  type HazardZone,
  type LayerId,
  type LayerInfo,
  type LayersResponse,
  type LonLat,
  type PointInput,
  type ProfilePoint,
  type ReturnCheck,
  type ConditionsResponse,
  type ValidationResponse,
  type RouteProfileId,
  type RouteRequest,
  type RouteResponse,
  type RouteStats,
  type SafetyLevel,
  type SensitivityResponse,
  type SitesResponse,
} from "./types.ts";

const LATENCY_MS = 650;
const SAMPLE_SPACING_M = 20;
const SAMPLE_SPEED_MPS = 0.8;
const SAMPLE_SOURCE = "Sample data (mock)";

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError("aborted", "Request cancelled"));
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new ApiError("aborted", "Request cancelled"));
      },
      { once: true },
    );
  });
}

type Local = readonly [east: number, north: number];

function makeFrame(origin: LonLat) {
  const mLon = metresPerDegLon(origin[1]);
  const toLocal = (p: { lon: number; lat: number }): Local => [
    (p.lon - origin[0]) * mLon,
    (p.lat - origin[1]) * METRES_PER_DEG_LAT,
  ];
  const fromLocal = (l: Local): LonLat => offsetLonLat(origin, l[0], l[1]);
  return { toLocal, fromLocal };
}

/** Synthetic terrain height in metres at a local position. */
function sampleElevation([e, n]: Local): number {
  return 34 * Math.sin(e / 410) * Math.cos(n / 530) + 14 * Math.sin((e + n) / 170) + 4.5 * Math.sin(e / 53);
}

interface BuiltPath {
  polyline: LonLat[];
  local: Local[];
  /** Index in `polyline` of each waypoint (start first). */
  waypointIndex: number[];
}

/** Smooth meandering path through the waypoints, sampled about every 20 m. */
function buildPath(waypoints: readonly PointInput[], meander: number, sign: 1 | -1): BuiltPath {
  const first = waypoints[0];
  if (!first) return { polyline: [], local: [], waypointIndex: [] };
  const { toLocal, fromLocal } = makeFrame([first.lon, first.lat]);
  const pts = waypoints.map(toLocal);

  const local: Local[] = [];
  const waypointIndex: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(len / SAMPLE_SPACING_M));
    const amp = len > 0 ? Math.min(meander * 0.12 * len, meander * 40) * sign : 0;
    const phase = i * 1.3;
    for (let k = i === 1 ? 0 : 1; k <= steps; k += 1) {
      const t = k / steps;
      const off = amp * Math.sin(Math.PI * t) * Math.cos(2 * Math.PI * 1.5 * t + phase);
      const nx = len > 0 ? -dy / len : 0;
      const ny = len > 0 ? dx / len : 0;
      local.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
    }
    waypointIndex.push(local.length - 1);
  }
  return { polyline: local.map(fromLocal), local, waypointIndex };
}

function pathLength(polyline: readonly LonLat[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < polyline.length; i += 1) {
    const a = polyline[i - 1];
    const b = polyline[i];
    out.push((out[i - 1] ?? 0) + (a && b ? haversine(a, b) : 0));
  }
  return out;
}

function buildProfile(local: readonly Local[], dist: readonly number[]): ProfilePoint[] {
  const elev = local.map(sampleElevation);
  return local.map((_, i) => {
    const j = i === 0 ? 1 : i;
    const d = (dist[j] ?? 0) - (dist[j - 1] ?? 0);
    const dz = (elev[j] ?? 0) - (elev[j - 1] ?? 0);
    return {
      dist_m: dist[i] ?? 0,
      elev_m: elev[i] ?? 0,
      slope_deg: d > 0 ? (Math.atan(Math.abs(dz) / d) * 180) / Math.PI : 0,
    };
  });
}

function buildHazards(path: BuiltPath): HazardZone[] {
  const kinds: Array<{ kind: HazardZone["kind"]; label: string }> = [
    { kind: "rough_terrain", label: "Rough terrain" },
    { kind: "sand_trap", label: "Sand trap" },
  ];
  const zones: HazardZone[] = [];
  const segments = Math.min(2, path.waypointIndex.length - 1);
  for (let s = 0; s < segments; s += 1) {
    const i0 = path.waypointIndex[s] ?? 0;
    const i1 = path.waypointIndex[s + 1] ?? 0;
    const mid = path.local[Math.floor((i0 + i1) / 2)];
    const a = path.local[i0];
    const b = path.local[i1];
    const meta = kinds[s % kinds.length];
    if (!mid || !a || !b || !meta) continue;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const side = s % 2 === 0 ? 1 : -1;
    const cx = mid[0] + (-dy / len) * 150 * side;
    const cy = mid[1] + (dx / len) * 150 * side;
    const first = path.polyline[0];
    if (!first) continue;
    const { fromLocal } = makeFrame(first);
    const ring: LonLat[] = [];
    const vertices = 9;
    for (let v = 0; v < vertices; v += 1) {
      const ang = (2 * Math.PI * v) / vertices;
      const r = 70 + 25 * Math.sin(v * 2.1 + s);
      ring.push(fromLocal([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]));
    }
    const start = ring[0];
    if (start) ring.push(start);
    zones.push({ id: `hazard-${s + 1}`, kind: meta.kind, label: meta.label, polygon: { type: "Polygon", coordinates: [ring] } });
  }
  return zones;
}

function safetyFor(maxSlope: number): { safety: SafetyLevel; reason: string } {
  const cls = classifySlope(maxSlope, SLOPE_LIMITS);
  const steepest = `Steepest section is ${maxSlope.toFixed(1)}°`;
  if (cls === "ok") return { safety: "ok", reason: `${steepest}, within the ${SLOPE_LIMITS.cautionDeg}° caution threshold.` };
  if (cls === "caution") {
    return { safety: "caution", reason: `${steepest}, above the ${SLOPE_LIMITS.cautionDeg}° caution threshold.` };
  }
  return { safety: "avoid", reason: `${steepest}, above the ${SLOPE_LIMITS.maxDeg}° limit.` };
}

const MOCK_EVA_LIMIT_S = 8 * 3600;
/** Sample detour per profile: "fast" cuts closer to the straight line, "safe" bends further. */
const PROFILE_MEANDER: Record<RouteProfileId, number> = { fast: 0.6, balanced: 1, safe: 1.5 };

/** Share of the distance in each slope class, and the summed climb and descent, from the sampled profile. */
function sampleStats(profile: readonly ProfilePoint[]): RouteStats {
  const share = { ok: 0, caution: 0, avoid: 0 };
  let climb = 0;
  let descent = 0;
  let total = 0;
  for (let i = 1; i < profile.length; i += 1) {
    const a = profile[i - 1];
    const b = profile[i];
    if (!a || !b) continue;
    const d = b.dist_m - a.dist_m;
    share[classifySlope(b.slope_deg, SLOPE_LIMITS)] += d;
    total += d;
    const dz = b.elev_m - a.elev_m;
    if (dz > 0) climb += dz;
    else descent -= dz;
  }
  const pct = (x: number) => (total > 0 ? Math.round((x / total) * 1000) / 10 : 0);
  const ok = pct(share.ok);
  const caution = pct(share.caution);
  return { slope_class_pct: { ok, caution, avoid: Math.round((100 - ok - caution) * 10) / 10 }, climb_m: climb, descent_m: descent };
}

export async function mockRoute(req: RouteRequest, signal?: AbortSignal): Promise<RouteResponse> {
  await delay(LATENCY_MS, signal);
  if (req.stops.length === 0) throw new ApiError("http", "HTTP 422", 422);

  const waypoints = [req.start, ...req.stops];
  const profileId = req.profile ?? "balanced";
  const main = buildPath(waypoints, PROFILE_MEANDER[profileId], 1);
  const dist = pathLength(main.polyline);
  const profile = buildProfile(main.local, dist);
  const maxSlope = profile.reduce((m, p) => Math.max(m, p.slope_deg), 0);
  const distance = dist[dist.length - 1] ?? 0;
  const { safety, reason } = safetyFor(maxSlope);

  let alternative: RouteResponse["alternative"] = null;
  if (req.compare) {
    const alt = buildPath(waypoints, 2.2, -1);
    const altDist = pathLength(alt.polyline);
    const altProfile = buildProfile(alt.local, altDist);
    const altLen = altDist[altDist.length - 1] ?? 0;
    alternative = {
      distance_m: altLen,
      max_slope_deg: altProfile.reduce((m, p) => Math.max(m, p.slope_deg), 0),
      est_time_s: altLen / SAMPLE_SPEED_MPS,
      polyline: alt.polyline,
    };
  }

  const estTime = distance / SAMPLE_SPEED_MPS;
  const roundTrip = estTime * 2;
  const stopsTime = req.stops.length * (req.stop_time_min ?? 0) * 60;
  const returnCheck = sampleReturnCheck(main.polyline, dist);
  const level =
    roundTrip + stopsTime > MOCK_EVA_LIMIT_S || !returnCheck.ok
      ? "NOT_ADVISED"
      : maxSlope > SLOPE_LIMITS.cautionDeg
        ? "MARGINAL"
        : "NOMINAL";
  const reasons =
    level === "NOT_ADVISED"
      ? ["Sample data: the EVA time or the walk back is over the sample limit."]
      : level === "MARGINAL"
        ? [`Sample data: the steepest section is above the ${SLOPE_LIMITS.cautionDeg}° caution threshold.`]
        : ["Sample data: the round trip fits the sample EVA limit and the slope is within the caution threshold."];

  return {
    supports_alternatives: true,
    route_profile: profileId,
    profile_fallback: false,
    stats: sampleStats(profile),
    return: { distance_m: distance, est_time_s: estTime },
    round_trip_time_s: roundTrip,
    eva_limit_s: MOCK_EVA_LIMIT_S,
    readiness: { level, reasons },
    return_check: returnCheck,
    stops_time_s: stopsTime,
    eva_time_s: roundTrip + stopsTime,
    // The old pair, as the backend still sends it next to `readiness`.
    status: level === "NOT_ADVISED" ? "NO-GO" : level === "MARGINAL" ? "CAUTION" : "GO",
    reasons,
    navigation: { vertex_dist_m: dist, heading_segments: main.polyline.slice(1).map((_, i) => i) },
    computed_at: new Date().toISOString(),
    distance_m: distance,
    max_slope_deg: maxSlope,
    est_time_s: estTime,
    safety,
    safety_reason: reason,
    polyline: main.polyline,
    stops: req.stops.map((s, i) => ({
      id: s.id,
      name: s.name ?? null,
      lon: s.lon,
      lat: s.lat,
      dist_m: dist[main.waypointIndex[i + 1] ?? 0] ?? 0,
      note: "Sample note. A real science note comes from the API.",
      image: null,
    })),
    hazards: buildHazards(main),
    profile,
    assumptions: [
      { name: "Terrain model", value: "Synthetic sine-wave surface", source: SAMPLE_SOURCE },
      { name: "Travel speed", value: `${SAMPLE_SPEED_MPS} m/s`, source: SAMPLE_SOURCE },
      { name: "Max slope constraint", value: `${req.constraints.max_slope_deg}°`, source: "Route request" },
      { name: "Hazard zones", value: "Generated beside the route", source: SAMPLE_SOURCE },
    ],
    alternative,
  };
}

/** Sample sensitivity: the same sample path, with a limit that either passes or does not. */
export async function mockSensitivity(req: RouteRequest, signal?: AbortSignal): Promise<SensitivityResponse> {
  const route = await mockRoute(req, signal);
  return {
    site_id: req.site_id ?? "gale-bx",
    results: [10, 15, 20].map((limit) =>
      route.max_slope_deg <= limit
        ? { limit_deg: limit, reachable: true, distance_m: route.distance_m, est_time_s: route.est_time_s, max_slope_deg: route.max_slope_deg, reason: null }
        : { limit_deg: limit, reachable: false, distance_m: null, est_time_s: null, max_slope_deg: null, reason: `Sample data: the sample path reaches ${route.max_slope_deg.toFixed(1)}°.` },
    ),
  };
}

export async function mockConditions(signal?: AbortSignal): Promise<ConditionsResponse> {
  await delay(250, signal);
  return {
    available: true,
    provider: "Sample data (mock), not the REMS feed",
    disclaimer: "Sample values for development. Not measured.",
    source_url: "https://mars.nasa.gov/",
    sol: 0,
    earth_date: null,
    ls_deg: null,
    season: null,
    air_temp_min_c: -70,
    air_temp_max_c: -10,
    ground_temp_min_c: -80,
    ground_temp_max_c: 0,
    pressure_pa: 750,
    pressure_note: null,
    sunrise: "06:00",
    sunset: "18:00",
    uv_index: null,
    opacity: null,
    wind_speed: null,
    fetched_at: null,
  };
}

/** Sample validation: made-up numbers, labelled as sample data in the source. */
export async function mockValidation(signal?: AbortSignal): Promise<ValidationResponse> {
  await delay(250, signal);
  return {
    available: true,
    site_id: "gale-bx",
    status: "ok",
    n_points: 1000,
    reason: null,
    raw: { mean_m: -1, std_m: 1, max_abs_m: 4, rmse_m: 1.4 },
    offset_corrected: { offset_m: -1, mean_m: 0, std_m: 1, max_abs_m: 3, rmse_m: 1 },
    source: { url: "https://example.org/sample-data", fetched_utc: "1970-01-01T00:00:00Z" },
  };
}

export async function mockLayers(signal?: AbortSignal): Promise<LayersResponse> {
  await delay(250, signal);
  const available = (id: LayerId): LayerInfo => ({ id, available: true, reason: null, source: SAMPLE_SOURCE });
  const missing = (id: LayerId): LayerInfo => ({ id, available: false, reason: NO_DATA_REASON, source: null });
  return {
    layers: [available("slope"), available("optical"), missing("thermal"), missing("geology"), available("radiation")],
  };
}

/** Sample targets around the map centre, so the group picker can be tried without a backend. */
export async function mockSites(signal?: AbortSignal): Promise<SitesResponse> {
  await delay(250, signal);
  const origin: LonLat = [137.3828, -4.8032];
  const at = (id: string, east: number, north: number) => {
    const [lon, lat] = offsetLonLat(origin, east, north);
    return { id, name: `Sample target ${id.toUpperCase()}`, lon, lat, note: "Sample data, not a real target.", image: null, source_id: null };
  };
  return {
    sites: [
      {
        id: "gale-bx",
        name: "Sample site",
        groups: [{ id: "sample", name: "Sample group", stop_ids: ["s1", "s2", "s3"] }],
        context: null,
        stops: [at("s1", -120, 90), at("s2", 40, -60), at("s3", 160, 110)],
      },
    ],
  };
}

/** Sample return check: straight line back to the start, the only "terrain" the mock has. */
function sampleReturnCheck(polyline: readonly LonLat[], along: readonly number[]): ReturnCheck {
  const start = polyline[0] ?? [0, 0];
  const back = polyline.map((p) => haversine(start, p));
  let worst = 0;
  back.forEach((d, i) => {
    if (d > (back[worst] ?? 0)) worst = i;
  });
  const worstM = back[worst] ?? 0;
  return {
    ok: worstM <= 2000 && worstM / SAMPLE_SPEED_MPS <= 3600,
    worst_return_m: worstM,
    worst_return_s: worstM / SAMPLE_SPEED_MPS,
    worst_point: polyline[worst] ?? start,
    worst_route_dist_m: along[worst] ?? 0,
    limit_m: 2000,
    limit_s: 3600,
  };
}
