import { useId, useState } from "react";
import type { RouteResponse } from "../api/types.ts";
import { SLOPE_LIMITS } from "../config/route.ts";
import { formatDistance, formatDuration, formatSigned, formatSlope } from "../lib/format.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
import { useSite } from "../state/SiteContext.tsx";
import { Icon } from "./Icon.tsx";
import { SafetyBadge } from "./SafetyBadge.tsx";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt className="stat__label">{label}</dt>
      <dd className="stat__value mono">{value}</dd>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div role="status" aria-live="polite">
      <p className="progress-text">
        <span className="spinner" aria-hidden="true" /> Computing route
      </p>
      <div className="stat-grid" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="stat">
            <div className="skeleton skeleton--label" />
            <div className="skeleton skeleton--value" />
          </div>
        ))}
      </div>
      <div className="skeleton skeleton--badge" aria-hidden="true" />
    </div>
  );
}

function CompareTable({ route }: { route: RouteResponse }) {
  const alt = route.alternative;
  if (!alt) {
    return <p className="muted">No alternative route found for these points</p>;
  }
  const rows = [
    { label: "Length", main: formatDistance(route.distance_m), alt: formatDistance(alt.distance_m), delta: formatSigned(alt.distance_m - route.distance_m, formatDistance) },
    { label: "Max slope", main: formatSlope(route.max_slope_deg), alt: formatSlope(alt.max_slope_deg), delta: formatSigned(alt.max_slope_deg - route.max_slope_deg, formatSlope) },
    { label: "Est. time", main: formatDuration(route.est_time_s), alt: formatDuration(alt.est_time_s), delta: formatSigned(alt.est_time_s - route.est_time_s, formatDuration) },
  ];
  return (
    <table className="table compare-table">
      <caption className="sr-only">Planned route compared with the alternative</caption>
      <thead>
        <tr>
          <th scope="col">Metric</th>
          <th scope="col">Route</th>
          <th scope="col">Alternative</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <td className="mono">{r.main}</td>
            <td className="mono">{r.alt}</td>
            <td className="mono">{r.delta}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const UNVERIFIED = /^TO VERIFY\b:?\s*/i;

function SourceCell({ text }: { text: string }) {
  // The data team marks sources that are not checked yet with "TO VERIFY"; say so on screen.
  if (!UNVERIFIED.test(text)) return <>{text}</>;
  return (
    <>
      <span className="tag tag--warn">Unverified</span> {text.replace(UNVERIFIED, "")}
    </>
  );
}

function HowComputed({ route }: { route: RouteResponse }) {
  const [open, setOpen] = useState(false);
  const { site } = useSite();
  const regionId = useId();
  return (
    <div className="drawer">
      <button
        type="button"
        className="drawer__toggle"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((o) => !o)}
      >
        <span>How this is computed</span>
        <Icon name="chevron" className={open ? "chevron chevron--open" : "chevron"} />
      </button>
      <div id={regionId} className="drawer__body" hidden={!open}>
        <p className="muted">Assumptions and sources returned by the route service</p>
        {route.assumptions.length === 0 ? (
          <p className="muted">The service returned no assumptions</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Assumption</th>
                <th scope="col">Value</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {route.assumptions.map((a) => (
                <tr key={a.name}>
                  <th scope="row">{a.name}</th>
                  <td className="mono">{a.value}</td>
                  <td>
                    <SourceCell text={a.source} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {site.sources.length > 0 && (
          <>
            <h3 className="drawer__subtitle">Data sources</h3>
            <ul className="source-list">
              {site.sources.map((src) => (
                <li key={src}>{src}</li>
              ))}
            </ul>
          </>
        )}
        {site.isTestData && <p className="muted drawer__foot">This grid is generated test data, not measured terrain.</p>}
        <p className="muted drawer__foot">
          Slope colours use app thresholds of {SLOPE_LIMITS.cautionDeg}° and {SLOPE_LIMITS.maxDeg}°.
        </p>
      </div>
    </div>
  );
}

export function RouteSummary() {
  const p = usePlanner();
  const { state, view, stale, fetching } = p;
  const route = state.route;

  return (
    <section className="panel__section" aria-labelledby="summary-title">
      <header className="panel__head">
        <h2 id="summary-title" className="panel__title">
          <Icon name="route" /> Route summary
        </h2>
        {stale && <span className="tag tag--warn">Out of date</span>}
      </header>

      {view === "empty" && (
        <div className="empty">
          <p className="empty__title">No route yet</p>
          <ol className="empty__steps">
            <li>Click the map to set a start point</li>
            <li>Click again to add up to 5 stops</li>
            <li>Review the route and its safety status</li>
          </ol>
        </div>
      )}

      {view === "loading" && !route && <SummarySkeleton />}

      {view === "error" && (
        <div className="notice notice--error" role="alert">
          <Icon name="wifiOff" />
          <span>{state.error}</span>
          <button type="button" className="btn" onClick={p.recalculate} disabled={fetching}>
            <Icon name="refresh" /> Retry
          </button>
        </div>
      )}

      {route && (
        <div className={stale ? "summary summary--stale" : "summary"}>
          {stale && (
            <p className="progress-text" role="status">
              {fetching ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Recalculating route
                </>
              ) : (
                <>
                  <Icon name="clock" /> Points changed. Recalculating shortly
                </>
              )}
            </p>
          )}
          <dl className="stat-grid">
            <Stat label="Length" value={formatDistance(route.distance_m)} />
            <Stat label="Max slope" value={formatSlope(route.max_slope_deg)} />
            <Stat label="Est. time" value={formatDuration(route.est_time_s)} />
          </dl>
          <div className="safety">
            <span className="stat__label">Safety status</span>
            <SafetyBadge level={route.safety} />
            <p className="safety__reason">{route.safety_reason}</p>
          </div>
        </div>
      )}

      {state.start && (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={p.recalculate}
            disabled={fetching || state.stops.length === 0}
          >
            <Icon name="refresh" /> Recalculate
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={state.compare}
            onClick={() => p.setCompare(!state.compare)}
            disabled={state.stops.length === 0}
          >
            <Icon name="compare" /> Compare
          </button>
          <button type="button" className="btn btn--ghost" onClick={p.reset}>
            <Icon name="trash" /> Clear
          </button>
        </div>
      )}

      {state.compare && route && (
        <div className="compare">
          {fetching && !route.alternative ? (
            <p className="progress-text" role="status">
              <span className="spinner" aria-hidden="true" /> Finding an alternative route
            </p>
          ) : (
            <CompareTable route={route} />
          )}
        </div>
      )}

      {route && <HowComputed route={route} />}
    </section>
  );
}

/** One-line status under the map on narrow screens, where the summary panel is a closed drawer. */
export function MobileSummary({ onOpen }: { onOpen: () => void }) {
  const { state, stale } = usePlanner();
  const route = state.route;
  if (!route) return null;
  return (
    <button
      type="button"
      className={`mobile-summary${stale ? " mobile-summary--stale" : ""}`}
      onClick={onOpen}
    >
      <SafetyBadge level={route.safety} />
      <span className="mono">{formatDistance(route.distance_m)}</span>
      <span className="mono">{formatDuration(route.est_time_s)}</span>
      {stale && <span className="tag tag--warn">Out of date</span>}
      <span className="sr-only">Open route details</span>
      <Icon name="chevron" className="mobile-summary__chev" />
    </button>
  );
}
