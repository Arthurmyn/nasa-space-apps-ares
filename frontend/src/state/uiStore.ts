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
}

let current: UiState = { howComputedOpen: false, leftCollapsed: false, rightCollapsed: false };
const listeners = new Set<() => void>();

export const uiStore = {
  get: (): UiState => current,
  setHowComputedOpen(open: boolean) {
    this.patch({ howComputedOpen: open });
  },
  togglePanel(side: "left" | "right") {
    this.patch(side === "left" ? { leftCollapsed: !current.leftCollapsed } : { rightCollapsed: !current.rightCollapsed });
  },
  patch(next: Partial<UiState>) {
    const merged = { ...current, ...next };
    if (merged.howComputedOpen === current.howComputedOpen && merged.leftCollapsed === current.leftCollapsed && merged.rightCollapsed === current.rightCollapsed) return;
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
