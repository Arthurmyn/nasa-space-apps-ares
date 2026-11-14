import { useMemo } from "react";
import { MAX_STOPS } from "../config/route.ts";
import { formatDistance } from "../lib/format.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
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

      <button type="button" className="btn btn--block" onClick={addAtCentre} disabled={atMax}>
        <Icon name="crosshair" /> {addLabel}
      </button>
    </section>
  );
}
