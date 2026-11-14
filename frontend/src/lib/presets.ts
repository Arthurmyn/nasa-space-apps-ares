import type { SiteEntry, StopGroup } from "../api/types.ts";
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
    out.push({ lon: stop.lon, lat: stop.lat, name: stop.name });
  }
  return out;
}
