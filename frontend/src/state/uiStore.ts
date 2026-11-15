import { useSyncExternalStore } from "react";

/**
 * Small UI choices that must survive switching between Plan, HUD and Card (each mode unmounts
 * the others). Kept outside React state, like hoverStore.
 */
interface UiState {
  howComputedOpen: boolean;
  /** Desktop side panels folded away to give the map the width. */
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /** Curiosity's own traverse drawn on the map. Frontend-only layer, not in the API layer list. */
  traverseOn: boolean;
}

let current: UiState = { howComputedOpen: false, leftCollapsed: false, rightCollapsed: false, traverseOn: true };
const listeners = new Set<() => void>();

export const uiStore = {
  get: (): UiState => current,
  setHowComputedOpen(open: boolean) {
    this.patch({ howComputedOpen: open });
  },
  togglePanel(side: "left" | "right") {
    this.patch(side === "left" ? { leftCollapsed: !current.leftCollapsed } : { rightCollapsed: !current.rightCollapsed });
  },
  toggleTraverse() {
    this.patch({ traverseOn: !current.traverseOn });
  },
  patch(next: Partial<UiState>) {
    const merged = { ...current, ...next };
    if ((Object.keys(merged) as (keyof UiState)[]).every((k) => merged[k] === current[k])) return;
    current = merged;
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useUi(): UiState {
  return useSyncExternalStore(uiStore.subscribe, uiStore.get);
}
