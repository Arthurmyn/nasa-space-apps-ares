/** The smallest scale the card is allowed: below this the print is too small to read, so the overflow is reported instead. */
export const MIN_FIT = 0.7;

/**
 * The scale (1 or less) that makes content `contentPx` tall fit a page `pagePx` tall. Content that
 * already fits stays at 1. The result is rounded down to three decimals, so rounding can never leave
 * a pixel over the edge, and it never goes below MIN_FIT.
 */
export function fitScale(contentPx: number, pagePx: number): number {
  if (!(contentPx > 0) || !(pagePx > 0) || contentPx <= pagePx) return 1;
  return Math.max(MIN_FIT, Math.floor((pagePx / contentPx) * 1000) / 1000);
}

/** True when even the smallest allowed scale leaves content off the page. */
export const stillOverflows = (contentPx: number, pagePx: number): boolean => contentPx * MIN_FIT > pagePx;
