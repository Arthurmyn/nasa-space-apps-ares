import type { ProfilePoint } from "../api/types.ts";
import { classifySlope, type SlopeClass, type SlopeLimits } from "./slope.ts";

export interface ProfileSegment {
  cls: SlopeClass;
  /** Inclusive vertex indices into the profile array. */
  from: number;
  to: number;
}

/**
 * Linear interpolation of the profile at a distance. Clamps to the first/last sample.
 * Returns null for an empty profile.
 */
export function interpolateProfile(profile: readonly ProfilePoint[], distM: number): ProfilePoint | null {
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (!first || !last) return null;
  if (distM <= first.dist_m) return first;
  if (distM >= last.dist_m) return last;

  // Binary search for the surrounding pair; the profile can hold thousands of samples.
  let lo = 0;
  let hi = profile.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const p = profile[mid];
    if (p && p.dist_m <= distM) lo = mid;
    else hi = mid;
  }
  const a = profile[lo];
  const b = profile[hi];
  if (!a || !b) return last;
  const span = b.dist_m - a.dist_m;
  const t = span > 0 ? (distM - a.dist_m) / span : 0;
  return {
    dist_m: distM,
    elev_m: a.elev_m + (b.elev_m - a.elev_m) * t,
    slope_deg: a.slope_deg + (b.slope_deg - a.slope_deg) * t,
  };
}

/**
 * Group consecutive profile intervals by slope class. An interval takes the worse of its
 * two end slopes, so a steep spike is never averaged away.
 */
export function segmentsByClass(profile: readonly ProfilePoint[], limits: SlopeLimits): ProfileSegment[] {
  const segments: ProfileSegment[] = [];
  for (let i = 1; i < profile.length; i += 1) {
    const a = profile[i - 1];
    const b = profile[i];
    if (!a || !b) continue;
    const cls = classifySlope(Math.max(a.slope_deg, b.slope_deg), limits);
    const last = segments[segments.length - 1];
    if (last && last.cls === cls) last.to = i;
    else segments.push({ cls, from: i - 1, to: i });
  }
  return segments;
}

/**
 * Reduce a profile to about `maxPoints` samples for drawing. Each bucket keeps its
 * highest-slope sample so steep spikes survive. First and last samples are always kept.
 */
export function downsampleProfile(profile: readonly ProfilePoint[], maxPoints: number): ProfilePoint[] {
  if (maxPoints < 3 || profile.length <= maxPoints) return [...profile];
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (!first || !last) return [];

  const bucketCount = maxPoints - 2;
  const interior = profile.length - 2;
  const out: ProfilePoint[] = [first];
  for (let b = 0; b < bucketCount; b += 1) {
    const start = 1 + Math.floor((b * interior) / bucketCount);
    const end = 1 + Math.floor(((b + 1) * interior) / bucketCount);
    let pick: ProfilePoint | undefined;
    for (let i = start; i < end; i += 1) {
      const p = profile[i];
      if (p && (!pick || p.slope_deg > pick.slope_deg)) pick = p;
    }
    if (pick) out.push(pick);
  }
  out.push(last);
  return out;
}

export interface ProfileExtent {
  minElev: number;
  maxElev: number;
  totalDist: number;
}

export function profileExtent(profile: readonly ProfilePoint[]): ProfileExtent | null {
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (!first || !last) return null;
  let minElev = Infinity;
  let maxElev = -Infinity;
  for (const p of profile) {
    minElev = Math.min(minElev, p.elev_m);
    maxElev = Math.max(maxElev, p.elev_m);
  }
  return { minElev, maxElev, totalDist: last.dist_m - first.dist_m };
}

export interface SectionStats {
  fromDist: number;
  toDist: number;
  lengthM: number;
  maxSlopeDeg: number;
  /** Mean slope weighted by distance. */
  meanSlopeDeg: number;
  elevGainM: number;
  elevLossM: number;
}

/** Statistics for the part of the profile between two distances. Null if the span is empty. */
export function sectionStats(
  profile: readonly ProfilePoint[],
  fromDist: number,
  toDist: number,
): SectionStats | null {
  const start = interpolateProfile(profile, fromDist);
  const end = interpolateProfile(profile, toDist);
  if (!start || !end || toDist <= fromDist) return null;

  const samples: ProfilePoint[] = [
    start,
    ...profile.filter((p) => p.dist_m > fromDist && p.dist_m < toDist),
    end,
  ];
  let maxSlope = 0;
  let weighted = 0;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (!a || !b) continue;
    const d = b.dist_m - a.dist_m;
    maxSlope = Math.max(maxSlope, a.slope_deg, b.slope_deg);
    weighted += ((a.slope_deg + b.slope_deg) / 2) * d;
    const dz = b.elev_m - a.elev_m;
    if (dz > 0) gain += dz;
    else loss -= dz;
  }
  const length = end.dist_m - start.dist_m;
  return {
    fromDist: start.dist_m,
    toDist: end.dist_m,
    lengthM: length,
    maxSlopeDeg: maxSlope,
    meanSlopeDeg: length > 0 ? weighted / length : 0,
    elevGainM: gain,
    elevLossM: loss,
  };
}
