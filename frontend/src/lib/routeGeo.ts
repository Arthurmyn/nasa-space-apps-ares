import type { LonLat, ProfilePoint } from "../api/types.ts";
import { slicePath } from "./geo.ts";
import { profileExtent, segmentsByClass } from "./profile.ts";
import type { SlopeClass, SlopeLimits } from "./slope.ts";

/**
 * The profile and the polyline describe the same route, so a distance along the profile
 * maps to the same fraction of the polyline's length. This avoids depending on the two
 * having sample points at identical places.
 */
export function profileDistToFraction(profile: readonly ProfilePoint[], distM: number): number {
  const extent = profileExtent(profile);
  const first = profile[0];
  if (!extent || !first || extent.totalDist <= 0) return 0;
  return Math.min(1, Math.max(0, (distM - first.dist_m) / extent.totalDist));
}

export function fractionToProfileDist(profile: readonly ProfilePoint[], fraction: number): number {
  const extent = profileExtent(profile);
  const first = profile[0];
  if (!extent || !first) return 0;
  return first.dist_m + Math.min(1, Math.max(0, fraction)) * extent.totalDist;
}

export interface SlopeLine {
  cls: SlopeClass;
  coordinates: LonLat[];
}

/** Route geometry cut into runs of equal slope class, for the Slope layer overlay. */
export function slopeLines(
  polyline: readonly LonLat[],
  profile: readonly ProfilePoint[],
  limits: SlopeLimits,
): SlopeLine[] {
  return segmentsByClass(profile, limits)
    .map((seg) => {
      const a = profile[seg.from];
      const b = profile[seg.to];
      if (!a || !b) return null;
      const coordinates = slicePath(
        polyline,
        profileDistToFraction(profile, a.dist_m),
        profileDistToFraction(profile, b.dist_m),
      );
      return coordinates.length >= 2 ? { cls: seg.cls, coordinates } : null;
    })
    .filter((line): line is SlopeLine => line !== null);
}
