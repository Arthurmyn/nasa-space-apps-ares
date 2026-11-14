import { useMemo } from "react";
import { formatCoordinates, formatDistance } from "../lib/format.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
import { buildStopEntries } from "../state/stopEntries.ts";
import { Icon } from "./Icon.tsx";

export function StopCard() {
  const p = usePlanner();
  const entry = useMemo(
    () => buildStopEntries(p.state).find((e) => e.id === p.state.selectedId) ?? null,
    [p.state],
  );

  return (
    <section className="panel__section" aria-labelledby="stopcard-title" aria-live="polite">
      <header className="panel__head">
        <h2 id="stopcard-title" className="panel__title">
          <Icon name="map" /> Stop details
        </h2>
        {entry && (
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Clear selection" onClick={() => p.select(null)}>
            <Icon name="close" />
          </button>
        )}
      </header>

      {!entry && <p className="muted">Select a stop on the map or in the list</p>}

      {entry && (
        <article className="stop-card">
          <div className="stop-card__title">
            <span className={`pin pin--${entry.kind}`} aria-hidden="true">
              {entry.label}
            </span>
            <h3>{entry.title}</h3>
          </div>

          <dl className="kv">
            <div>
              <dt>Coordinates</dt>
              <dd className="mono">{formatCoordinates(entry.lat, entry.lon, 5)}</dd>
            </div>
            {entry.kind === "stop" && (
              <div>
                <dt>Distance along route</dt>
                <dd className="mono">{entry.distM !== null ? formatDistance(entry.distM) : "Not computed yet"}</dd>
              </div>
            )}
          </dl>

          {entry.kind === "stop" && (
            <>
              <div>
                <h4 className="eyebrow">Note</h4>
                <p className={entry.note ? "" : "muted"}>{entry.note ?? "No note for this stop"}</p>
              </div>

              <figure className="image-slot">
                {entry.image ? (
                  <img src={entry.image.url} alt={entry.image.alt} loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <div className="image-slot__empty">
                    <Icon name="mountain" size={20} />
                    <span>No rover image for this stop</span>
                  </div>
                )}
                <figcaption className="image-slot__credit">
                  {entry.image ? `Credit: ${entry.image.credit}` : "Credit: none"}
                </figcaption>
              </figure>
            </>
          )}

          <button type="button" className="btn btn--ghost btn--block" onClick={() => p.removePoint(entry.id)}>
            <Icon name="trash" /> {entry.kind === "start" ? "Remove start point" : `Remove stop ${entry.label}`}
          </button>
        </article>
      )}
    </section>
  );
}
