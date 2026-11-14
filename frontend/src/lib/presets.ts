import type { LonLat, SiteEntry, StopGroup } from "../api/types.ts";
import { haversine } from "./geo.ts";
import type { PresetStop } from "../state/plannerReducer.ts";

/**
 * The targets of a group, in the order the group lists them. Ids the site does not define are
 * skipped, and a repeated id is used once, so a bad stops.json cannot place a stop twice.
 */
export function groupTargets(site: Pick<SiteEntry, "stops">, group: Pick<StopGroup, "stop_ids">): PresetStop[] {
  const byId = new Map(site.stops.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: PresetStop[] = [];
  for (const id of group.stop_ids) {
    const stop = byId.get(id);
    if (!stop || seen.has(id)) continue;
    seen.add(id);
    out.push({ lon: stop.lon, lat: stop.lat, name: stop.name, note: stop.note, image: stop.image });
  }
  return out;
}

/**
 * Visit order for a group when the walk starts at `start`: always the nearest target next. The
 * group list order is only a list; taken as a route from a start in its middle it would walk
 * out and back over the same ground.
 */
export function orderFromStart(start: { lon: number; lat: number }, targets: readonly PresetStop[]): PresetStop[] {
  const left = [...targets];
  const out: PresetStop[] = [];
  let here: LonLat = [start.lon, start.lat];
  while (left.length > 0) {
    let best = 0;
    let bestD = Infinity;
    left.forEach((t, i) => {
      const d = haversine(here, [t.lon, t.lat]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const [next] = left.splice(best, 1);
    if (!next) break;
    out.push(next);
    here = [next.lon, next.lat];
  }
  return out;
}
