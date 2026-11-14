import { useSyncExternalStore } from "react";

/**
 * Small UI choices that must survive switching between Plan, HUD and Card (each mode unmounts
 * the others). Kept outside React state, like hoverStore.
 */
interface UiState {
  howComputedOpen: boolean;
}

let current: UiState = { howComputedOpen: false };
const listeners = new Set<() => void>();

export const uiStore = {
  get: (): UiState => current,
  setHowComputedOpen(open: boolean) {
    if (current.howComputedOpen === open) return;
    current = { ...current, howComputedOpen: open };
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
