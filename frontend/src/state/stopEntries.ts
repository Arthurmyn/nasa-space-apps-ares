import type { StopImage } from "../api/types.ts";
import { stopLabel } from "../lib/format.ts";
import type { PlannerState } from "./plannerReducer.ts";

export interface StopEntry {
  id: string;
  kind: "start" | "stop";
  /** Short map label: "S" for the start, "A", "B", ... for stops. */
  label: string;
  /** Display name, for example "Start" or "Stop A". */
  title: string;
  lon: number;
  lat: number;
  /** Route distance at this point. Null until the API has answered for these exact coordinates. */
  distM: number | null;
  note: string | null;
  image: StopImage | null;
}

/**
 * Merge the points the user placed with what the API returned for them. API details (distance,
 * note, image) are used only while the coordinates still match what the API computed, so a
 * stop that was dragged never shows a note written for its old position.
 */
export function buildStopEntries(state: PlannerState): StopEntry[] {
  const entries: StopEntry[] = [];
  const route = state.route;

  if (state.start) {
    entries.push({
      id: state.start.id,
      kind: "start",
      label: "S",
      title: "Start",
      lon: state.start.lon,
      lat: state.start.lat,
      distM: route ? 0 : null,
      note: null,
      image: null,
    });
  }

  state.stops.forEach((p, i) => {
    const label = stopLabel(i);
    const api = route?.stops.find((s) => s.id === p.id);
    const matched = api !== undefined && api.lon === p.lon && api.lat === p.lat;
    entries.push({
      id: p.id,
      kind: "stop",
      label,
      title: (matched && api.name) || `Stop ${label}`,
      lon: p.lon,
      lat: p.lat,
      distM: matched ? api.dist_m : null,
      note: matched ? api.note : null,
      image: matched ? api.image : null,
    });
  });

  return entries;
}
