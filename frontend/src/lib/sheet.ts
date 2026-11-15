/** The bottom sheet's three heights, from lowest to highest. */
export const SNAPS = ["peek", "half", "full"] as const;
export type Snap = (typeof SNAPS)[number];

/** How far the sheet is pushed down from fully open (px) at each snap, for a sheet `height` tall with `peekPx` showing at peek. */
export function snapOffsets(height: number, peekPx: number): Record<Snap, number> {
  const peek = Math.max(0, height - peekPx);
  return { peek, half: Math.min(peek, Math.round(height / 2)), full: 0 };
}

/**
 * Where a drag that lets go at `offset` (px, 0 is fully open), moving at `velocity` px/s (positive is
 * downward), should come to rest. The release point is projected forward a little, like a flick on a
 * scroll view, and the nearest snap to that point wins, so a short fast flick moves the sheet one step
 * and a slow drag stays where it is closest.
 */
export function settle(offset: number, velocity: number, offsets: Record<Snap, number>, projectionS = 0.18): Snap {
  const projected = offset + velocity * projectionS;
  let best: Snap = "peek";
  let bestDistance = Infinity;
  for (const snap of SNAPS) {
    const d = Math.abs(offsets[snap] - projected);
    if (d < bestDistance) {
      best = snap;
      bestDistance = d;
    }
  }
  return best;
}

/** Enter or Space on the handle: peek, then half, then full, then back to peek. */
export function nextSnap(snap: Snap): Snap {
  return SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length] as Snap;
}

/** ArrowUp (-1) opens one step, ArrowDown (1) closes one step; it stops at the ends. */
export function stepSnap(snap: Snap, direction: -1 | 1): Snap {
  const i = SNAPS.indexOf(snap) - direction;
  return SNAPS[Math.min(SNAPS.length - 1, Math.max(0, i))] as Snap;
}

/** Keep a dragged offset inside the sheet: no higher than fully open, and no lower than peek. */
export function clampOffset(offset: number, offsets: Record<Snap, number>): number {
  return Math.min(offsets.peek, Math.max(0, offset));
}
