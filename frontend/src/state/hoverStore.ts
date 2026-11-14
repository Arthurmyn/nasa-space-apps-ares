import { useSyncExternalStore } from "react";

/**
 * Distance along the route (metres) under the pointer, shared by the map and the elevation
 * profile. Lives outside React state so a hover on one only re-renders the subscribers.
 */
export interface HoverState {
  distM: number | null;
  /** Which view set it, so that view can skip redundant work. */
  source: "map" | "profile" | null;
}

const EMPTY: HoverState = { distM: null, source: null };

let current: HoverState = EMPTY;
const listeners = new Set<() => void>();

function emit(next: HoverState) {
  current = next;
  listeners.forEach((l) => l());
}

export const hoverStore = {
  get: (): HoverState => current,
  set(distM: number, source: "map" | "profile") {
    if (current.distM === distM && current.source === source) return;
    emit({ distM, source });
  },
  clear() {
    if (current !== EMPTY) emit(EMPTY);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useHover(): HoverState {
  return useSyncExternalStore(hoverStore.subscribe, hoverStore.get);
}
