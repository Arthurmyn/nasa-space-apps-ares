import { useMemo } from "react";
import type { RouteResponse } from "../api/types.ts";
import {
  GCR_DOSE_EQUIVALENT_MSV_PER_DAY,
  RADIATION_CITATION,
  RADIATION_LABEL,
  RADIATION_NOTE,
} from "../config/radiation.ts";
import { estimatedDoseMsv, formatDose } from "../lib/radiation.ts";
import { formatDistance, formatDuration, formatSigned, formatSlope } from "../lib/format.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
import { exportFileName, routeToGeoJson } from "../lib/exportGeoJson.ts";
import { buildRouteRequest } from "../state/plannerReducer.ts";
import { useSite } from "../state/SiteContext.tsx";
import { uiStore, useUi } from "../state/uiStore.ts";
import { useSensitivity } from "../state/useSensitivity.ts";
import { Drawer } from "./Drawer.tsx";
import { ProfileSelector } from "./ProfileSelector.tsx";
import { EvaReadiness } from "./RouteStatus.tsx";
import { SensitivityTable } from "./SensitivityTable.tsx";
import { TripStats } from "./TripStats.tsx";
import { ReturnCheck } from "./ReturnCheck.tsx";
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

/** Saves the route as a .geojson file, made in the browser: nothing is uploaded. */
function downloadGeoJson(route: RouteResponse, siteId: string, siteName: string): void {
  const text = JSON.stringify(routeToGeoJson(route, { siteId, siteName }), null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: "application/geo+json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(siteId, route.computed_at);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function SensitivityDrawer({ enabled }: { enabled: boolean }) {
  const { state } = usePlanner();
  const { site } = useSite();
  const { sensitivityOpen } = useUi();
  const request = useMemo(() => buildRouteRequest(state, site.id), [state, site.id]);
  // Ask only for a plan that has a route that is up to date, and only while the drawer is open.
  const sensitivity = useSensitivity(request, sensitivityOpen && enabled);
  return (
    <Drawer title="Slope limit sensitivity" open={sensitivityOpen} onToggle={(v) => uiStore.setSensitivityOpen(v)}>
      <SensitivityTable state={sensitivity} />
    </Drawer>
  );
}

export function RouteSummary() {
  const p = usePlanner();
  const { state, view, stale, fetching } = p;
  const route = state.route;
  const supportsAlternatives = route?.supports_alternatives === true;
  const { site } = useSite();

  return (
    <section className="panel__section" aria-labelledby="summary-title">
      <header className="panel__head">
        <h2 id="summary-title" className="panel__title">
          <Icon name="route" /> Route summary
        </h2>
        {stale && <span className="tag tag--warn">Out of date</span>}
      </header>

      {state.start && <ProfileSelector value={state.profile} onChange={p.setProfile} />}

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
          <Icon name="alert" />
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
          {route.readiness && <EvaReadiness readiness={route.readiness} fallback={route.profile_fallback === true} />}
          <div className="safety">
            <span className="stat__label">Slope safety</span>
            <SafetyBadge level={route.safety} />
            <p className="safety__reason">{route.safety_reason}</p>
          </div>
          <TripStats route={route} />
          <ReturnCheck check={route.return_check} />
          <div className="dose">
            <span className="stat__label">{RADIATION_LABEL}</span>
            <span className="dose__value mono">{formatDose(estimatedDoseMsv(GCR_DOSE_EQUIVALENT_MSV_PER_DAY, route.est_time_s))}</span>
            <p className="muted dose__note">
              {RADIATION_NOTE}{" "}
              <a href={RADIATION_CITATION.doi} target="_blank" rel="noreferrer">
                {RADIATION_CITATION.text}
              </a>
            </p>
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
          {supportsAlternatives && <button
            type="button"
            className="btn"
            aria-pressed={state.compare}
            onClick={() => p.setCompare(!state.compare)}
            disabled={state.stops.length === 0}
          >
            <Icon name="compare" /> Compare
          </button>}
          {route && (
            <button type="button" className="btn" onClick={() => downloadGeoJson(route, site.id, site.name)} disabled={stale}>
              <Icon name="download" /> Export GeoJSON
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={p.reset}>
            <Icon name="trash" /> Clear
          </button>
        </div>
      )}

      {supportsAlternatives && state.compare && route && (
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

      {route && <SensitivityDrawer enabled={!stale && !fetching} />}
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
