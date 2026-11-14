import type { ProfilePoint } from "../api/types.ts";
import { sectionStats, type SectionStats } from "./profile.ts";
import { classifySlope, type SlopeClass, type SlopeLimits } from "./slope.ts";

export interface Waypoint {
  label: string;
  /** Distance along the route, metres. */
  distM: number;
}

export interface Leg {
  fromLabel: string;
  toLabel: string;
  stats: SectionStats;
  /** Class of the steepest point on the leg. */
  cls: SlopeClass;
}

/**
 * One leg per pair of consecutive waypoints (start to A, A to B, ...). Legs with no length
 * (two stops at the same distance, or out of order) are skipped rather than shown as zeros.
 */
export function routeLegs(
  profile: readonly ProfilePoint[],
  waypoints: readonly Waypoint[],
  limits: SlopeLimits,
): Leg[] {
  const legs: Leg[] = [];
  for (let i = 1; i < waypoints.length; i += 1) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    if (!a || !b) continue;
    const stats = sectionStats(profile, a.distM, b.distM);
    if (!stats) continue;
    legs.push({
      fromLabel: a.label,
      toLabel: b.label,
      stats,
      cls: classifySlope(stats.maxSlopeDeg, limits),
    });
  }
  return legs;
}
