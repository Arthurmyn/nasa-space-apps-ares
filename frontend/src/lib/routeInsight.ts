import type { ReadinessLevel, RouteProfileId, SafetyLevel, SlopeClassPct } from "../api/types.ts";

/** Which colour and icon a readiness level wears: the same three tones as the slope safety level. */
export const READINESS_TONE: Record<ReadinessLevel, SafetyLevel> = { NOMINAL: "ok", MARGINAL: "caution", NOT_ADVISED: "avoid" };

/** The words on screen. The wire value NOT_ADVISED has an underscore; people read "NOT ADVISED". */
export const READINESS_LABEL: Record<ReadinessLevel, string> = { NOMINAL: "NOMINAL", MARGINAL: "MARGINAL", NOT_ADVISED: "NOT ADVISED" };

export const PROFILE_INFO: Record<RouteProfileId, { label: string; hint: string }> = {
  fast: { label: "Fast", hint: "Shorter walk. Accepts steeper ground up to the route limit." },
  balanced: { label: "Balanced", hint: "The standard cost: length weighed against slope." },
  safe: { label: "Safe", hint: "Stays under the caution slope where a path exists; otherwise falls back to the route limit." },
};

/** "80%", "0.4%": one decimal only when the share is small and not whole. */
export function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return "–";
  const r = Math.round(pct * 10) / 10;
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)}%`;
}

export interface SlopeSegment {
  cls: SafetyLevel;
  pct: number;
  label: string;
  range: string;
}

/** The three slope classes in order, for the bar and its legend. Thresholds in degrees come from the caller. */
export function slopeSegments(pct: SlopeClassPct, cautionDeg: number, maxDeg: number): SlopeSegment[] {
  return [
    { cls: "ok", pct: pct.ok, label: "Gentle", range: `≤${cautionDeg}°` },
    { cls: "caution", pct: pct.caution, label: "Steep", range: `${cautionDeg}–${maxDeg}°` },
    { cls: "avoid", pct: pct.avoid, label: "Over limit", range: `>${maxDeg}°` },
  ];
}

/** Share of the EVA limit the round trip uses, as a 0 to 100+ number, or null when there is no limit or no trip. */
export function evaShare(roundTripS: number | null | undefined, limitS: number | null | undefined): number | null {
  if (roundTripS == null || limitS == null || !(limitS > 0) || !Number.isFinite(roundTripS)) return null;
  return (roundTripS / limitS) * 100;
}
