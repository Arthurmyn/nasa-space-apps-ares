import type { SafetyLevel } from "../api/types.ts";

/** Slope classes reuse the safety levels so one colour/icon/label system covers both. */
export type SlopeClass = SafetyLevel;

export interface SlopeLimits {
  /** Slopes above this are "caution", degrees. */
  readonly cautionDeg: number;
  /** Slopes above this are "avoid", degrees. */
  readonly maxDeg: number;
}

/** Classify an absolute slope in degrees. Limits are inclusive on the safer side. */
export function classifySlope(slopeDeg: number, limits: SlopeLimits): SlopeClass {
  // Treat missing data as the worst case rather than silently passing it.
  if (!Number.isFinite(slopeDeg)) return "avoid";
  const slope = Math.abs(slopeDeg);
  if (slope <= limits.cautionDeg) return "ok";
  if (slope <= limits.maxDeg) return "caution";
  return "avoid";
}

/** Labels for a single slope reading. */
export const SLOPE_CLASS_LABEL: Record<SlopeClass, string> = {
  ok: "Within limits",
  caution: "Steep",
  avoid: "Over limit",
};

/** Labels for the overall route safety status. */
export const SAFETY_LABEL: Record<SafetyLevel, string> = {
  ok: "Route within limits",
  caution: "Proceed with caution",
  avoid: "Avoid this route",
};
