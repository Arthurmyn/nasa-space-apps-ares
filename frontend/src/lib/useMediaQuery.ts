import { useSyncExternalStore } from "react";

/** Tracks a CSS media query. Falls back to `false` where matchMedia is missing (tests, SSR). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** The width from which the side panels sit beside the map instead of sliding over it. Keep equal to the CSS breakpoint in shell.css. */
export const DESKTOP_QUERY = "(min-width: 900px)";
