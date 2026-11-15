import { useSyncExternalStore } from "react";
import { parseDrivePath, type DrivePath } from "../lib/drivePath.ts";

export type DrivePathState = { status: "idle" } | { status: "loading" } | { status: "ready"; data: DrivePath } | { status: "error" };

/**
 * Curiosity's whole drive (msl_traverse.json), fetched once the first time the overlay is switched on (about 30 KB, not
 * part of the app bundle) and then kept. Outside React, like uiStore, so the layers panel and the
 * map read the same copy.
 */
let current: DrivePathState = { status: "idle" };
const listeners = new Set<() => void>();

const set = (next: DrivePathState) => {
  current = next;
  listeners.forEach((l) => l());
};

export const drivePathStore = {
  get: (): DrivePathState => current,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Start loading unless it is loaded or loading; call again after an error to retry. */
  async load(url = `${import.meta.env.BASE_URL}data/msl_traverse.json`): Promise<void> {
    if (current.status === "loading" || current.status === "ready") return;
    set({ status: "loading" });
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      set({ status: "ready", data: parseDrivePath(await res.json()) });
    } catch (e) {
      console.warn("Could not load the Curiosity drive path", e);
      set({ status: "error" });
    }
  },
};

export const useDrivePath = (): DrivePathState => useSyncExternalStore(drivePathStore.subscribe, drivePathStore.get);
