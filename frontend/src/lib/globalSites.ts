/**
 * The markers of the Mars overview: public/data/sites_global.json (docs/DATA_CONTRACT.md, section 9).
 * The file is read at run time, so a data change needs no code change.
 */

export const GLOBAL_SITE_TYPES = ["active", "landing", "landmark"] as const;
export type GlobalSiteType = (typeof GLOBAL_SITE_TYPES)[number];

export interface GlobalSiteSource {
  title: string;
  /** Only an http(s) address is kept; anything else is dropped. */
  url: string | null;
}

export interface GlobalSite {
  /** For an "active" entry this is the id of an ARES site, so it can be opened in the planner. */
  id: string;
  name: string;
  type: GlobalSiteType;
  /** Degrees east, -180 to 180. */
  lon: number;
  lat: number;
  note: string;
  source: GlobalSiteSource | null;
}

export const TYPE_LABEL: Record<GlobalSiteType, { one: string; many: string }> = {
  active: { one: "ARES site", many: "ARES sites" },
  landing: { one: "Landing site", many: "Landing sites" },
  landmark: { one: "Landmark", many: "Landmarks" },
};

export interface ParsedGlobalSites {
  sites: GlobalSite[];
  /** One line per entry that was dropped, with the reason. Never silent: the loader logs these. */
  rejected: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

function httpUrl(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** A source is either a link, or { title, url }. Both come out as { title, url }. */
function parseSource(v: unknown): GlobalSiteSource | null {
  if (typeof v === "string") {
    const url = httpUrl(v);
    if (url) return { title: new URL(url).hostname, url };
    const title = text(v);
    return title ? { title, url: null } : null;
  }
  if (!isRecord(v)) return null;
  const url = httpUrl(v.url);
  const title = text(v.title) ?? (url ? new URL(url).hostname : null);
  return title ? { title, url } : null;
}

/** Longitude as -180..180. East longitude written as 0..360 is accepted and shifted. */
export function normalizeLon(lon: number): number | null {
  if (!Number.isFinite(lon) || lon < -180 || lon > 360) return null;
  return lon > 180 ? lon - 360 : lon;
}

export function parseGlobalSites(raw: unknown): ParsedGlobalSites {
  if (!Array.isArray(raw)) throw new Error("sites_global.json must be a list of sites");
  const sites: GlobalSite[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  raw.forEach((item, i) => {
    const where = `entry ${i}`;
    if (!isRecord(item)) return void rejected.push(`${where}: not an object`);
    const id = text(item.id);
    const name = text(item.name);
    if (!id || !name) return void rejected.push(`${where}: id and name are required`);
    if (seen.has(id)) return void rejected.push(`${id}: duplicate id`);
    const type = GLOBAL_SITE_TYPES.find((t) => t === item.type);
    if (!type) return void rejected.push(`${id}: unknown type ${JSON.stringify(item.type)}`);
    const lon = typeof item.lon === "number" ? normalizeLon(item.lon) : null;
    const lat = typeof item.lat === "number" && Number.isFinite(item.lat) && item.lat >= -90 && item.lat <= 90 ? item.lat : null;
    if (lon === null || lat === null) return void rejected.push(`${id}: lon or lat is missing or out of range`);
    seen.add(id);
    sites.push({ id, name, type, lon, lat, note: text(item.note) ?? "", source: parseSource(item.source) });
  });
  return { sites, rejected };
}

/** Active entries within `maxDeg` of `site` (itself excluded). At world zoom their markers sit on top of each other. */
export function activeNear(sites: readonly GlobalSite[], site: GlobalSite, maxDeg = 1): GlobalSite[] {
  return sites.filter((s) => s.type === "active" && s.id !== site.id && Math.abs(s.lon - site.lon) <= maxDeg && Math.abs(s.lat - site.lat) <= maxDeg);
}

export const countByType = (sites: readonly GlobalSite[]): Record<GlobalSiteType, number> => {
  const out: Record<GlobalSiteType, number> = { active: 0, landing: 0, landmark: 0 };
  for (const s of sites) out[s.type] += 1;
  return out;
};
