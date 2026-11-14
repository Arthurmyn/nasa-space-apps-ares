import { MAX_STOPS } from "../config/route.ts";

/** A plan as it travels in the URL: coordinates only. Names and notes are looked up again. */
export interface UrlPlan {
  start: readonly [lon: number, lat: number] | null;
  stops: ReadonlyArray<readonly [lon: number, lat: number]>;
}

const DIGITS = 6;

const pair = (p: readonly [number, number]) => `${p[0].toFixed(DIGITS)},${p[1].toFixed(DIGITS)}`;

/** "s=lon,lat&p=lon,lat;lon,lat" for the URL hash (without the "#"). Empty when there is no plan. */
export function encodePlan(plan: UrlPlan): string {
  const parts: string[] = [];
  if (plan.start) parts.push(`s=${pair(plan.start)}`);
  if (plan.stops.length > 0) parts.push(`p=${plan.stops.map(pair).join(";")}`);
  return parts.join("&");
}

function parsePair(text: string): [number, number] | null {
  const bits = text.split(",");
  if (bits.length !== 2) return null;
  const lon = Number(bits[0]);
  const lat = Number(bits[1]);
  if (!bits[0] || !bits[1] || !Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  return [lon, lat];
}

/**
 * Read a plan from a URL hash. Anything malformed is dropped rather than trusted: a bad start is
 * ignored, bad stops are skipped, and at most MAX_STOPS stops are kept.
 */
export function decodePlan(hash: string): UrlPlan {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const start = parsePair(params.get("s") ?? "");
  const stops = (params.get("p") ?? "")
    .split(";")
    .map(parsePair)
    .filter((p): p is [number, number] => p !== null)
    .slice(0, MAX_STOPS);
  return { start, stops };
}
