import { useSyncExternalStore } from "react";

/** What the left flyout shows; picked from the icon rail (desktop) or the drawer tabs (narrow). */
export type SidePanel = "layers" | "sites" | "conditions" | "method";

/**
 * Small UI choices that must survive switching between Plan, HUD and Card (each mode unmounts
 * the others). Kept outside React state, like hoverStore.
 */
interface UiState {
  /** The slope-limit sensitivity drawer. Closed by default: opening it asks the backend for three more routes. */
  sensitivityOpen: boolean;
  /** The full drive path from the NASA traverse file (msl_traverse.json) on the Plan map. Off by default. */
  drivePathOn: boolean;
  /** The open left flyout, or null when only the rail shows and the map takes the width. */
  leftPanel: SidePanel | null;
  /** Desktop route column folded away to give the map the width. */
  rightCollapsed: boolean;
  /** Curiosity's own traverse drawn on the map. Frontend-only layer, not in the API layer list. */
  traverseOn: boolean;
}

let current: UiState = { sensitivityOpen: false, drivePathOn: false, leftPanel: null, rightCollapsed: false, traverseOn: true };
const listeners = new Set<() => void>();

export const uiStore = {
  get: (): UiState => current,
  /** A rail button: opens its panel, or closes it when it is already the open one. */
  toggleSidePanel(panel: SidePanel) {
    this.patch({ leftPanel: current.leftPanel === panel ? null : panel });
  },
  showSidePanel(panel: SidePanel | null) {
    this.patch({ leftPanel: panel });
  },
  toggleRight() {
    this.patch({ rightCollapsed: !current.rightCollapsed });
  },
  toggleTraverse() {
    this.patch({ traverseOn: !current.traverseOn });
  },
  setSensitivityOpen(open: boolean) {
    this.patch({ sensitivityOpen: open });
  },
  setDrivePathOn(on: boolean) {
    this.patch({ drivePathOn: on });
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
