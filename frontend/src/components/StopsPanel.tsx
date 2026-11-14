import { useId, useMemo } from "react";
import { MAX_STOPS } from "../config/route.ts";
import type { SiteEntry } from "../api/types.ts";
import { formatDistance } from "../lib/format.ts";
import { groupTargets } from "../lib/presets.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
import { useSite } from "../state/SiteContext.tsx";
import { buildStopEntries, type StopEntry } from "../state/stopEntries.ts";
import { viewportStore } from "../state/viewportStore.ts";
import { Icon } from "./Icon.tsx";

function StopChip({ entry, selected }: { entry: StopEntry; selected: boolean }) {
  const p = usePlanner();
  const dist = entry.kind === "stop" && entry.distM !== null ? formatDistance(entry.distM) : null;
  return (
    <li>
      <button
        type="button"
        className={`chip${selected ? " chip--selected" : ""}`}
        aria-pressed={selected}
        onClick={() => p.select(selected ? null : entry.id)}
      >
        {/* Accessible name = visible text ("A 1.19 km") plus a spoken suffix. */}
        <span className={`pin pin--${entry.kind}`}>{entry.label}</span>
        <span className="chip__text mono">{entry.kind === "start" ? "Start" : (dist ?? "–")}</span>
        {dist && <span className="sr-only">along route</span>}
      </button>
    </li>
  );
}

/** Picks a named group of science targets (for example "Boxwork") and places them as stops. */
function GroupPicker() {
  const p = usePlanner();
  const { sites, retrySites } = useSite();
  const selectId = useId();
  const entries = sites.entries;
  const groups = entries.flatMap((site) => site.groups.map((group) => ({ site, group, key: `${site.id}:${group.id}` })));

  if (sites.status === "loading") return <p className="muted">Loading target groups</p>;
  if (sites.status === "error") return (
    <div>
      <p className="muted" role="status">Target groups are unavailable</p>
      <button type="button" className="btn" onClick={retrySites}><Icon name="refresh" /> Retry target groups</button>
    </div>
  );
  if (groups.length === 0) return null;

  const label = (site: SiteEntry, name: string) => (entries.length > 1 ? `${site.name}: ${name}` : name);

  return (
    <div className="field">
      <label htmlFor={selectId} className="field__label">
        Science targets
      </label>
      <select
        id={selectId}
        className="select"
        value=""
        onChange={(e) => {
          const hit = groups.find((g) => g.key === e.target.value);
          if (hit) p.setPresetStops(groupTargets(hit.site, hit.group));
        }}
      >
        <option value="">Choose a group to place its targets</option>
        {groups.map(({ site, group, key }) => (
          <option key={key} value={key}>
            {label(site, group.name)} ({group.stop_ids.length})
          </option>
        ))}
      </select>
    </div>
  );
}

export function StopsPanel() {
  const p = usePlanner();
  const entries = useMemo(() => buildStopEntries(p.state), [p.state]);
  const stopCount = p.state.stops.length;
  const atMax = stopCount >= MAX_STOPS;
  const addLabel = !p.state.start ? "Set start at map centre" : atMax ? `Maximum ${MAX_STOPS} stops` : "Add stop at map centre";

  const addAtCentre = () => {
    const [lon, lat] = viewportStore.getCentre();
    p.addPoint(lon, lat);
  };

  return (
    <section className="panel__section" aria-labelledby="stops-title">
      <header className="panel__head">
        <h2 id="stops-title" className="panel__title">
          <Icon name="flag" /> Stops
        </h2>
        <span className="panel__meta mono">
          {stopCount}/{MAX_STOPS}
        </span>
      </header>

      {entries.length === 0 ? (
        <p className="muted">Click the map or use the button below to set a start point</p>
      ) : (
        <ul className="chip-list">
          {entries.map((e) => (
            <StopChip key={e.id} entry={e} selected={p.state.selectedId === e.id} />
          ))}
        </ul>
      )}

      <GroupPicker />

      <button type="button" className="btn btn--block" onClick={addAtCentre} disabled={atMax && p.state.start !== null}>
        <Icon name="crosshair" /> {addLabel}
      </button>
    </section>
  );
}
