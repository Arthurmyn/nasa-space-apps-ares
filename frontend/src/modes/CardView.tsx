import { useMemo } from "react";
import { dataSource } from "../api/client.ts";
import { RouteSketch } from "../components/RouteSketch.tsx";
import { SafetyBadge } from "../components/SafetyBadge.tsx";
import { Icon } from "../components/Icon.tsx";
import { SourceText } from "../components/SourceText.tsx";
import { SLOPE_LIMITS } from "../config/route.ts";
import { formatCoordinates, formatDistance, formatDuration, formatSignedElevation, formatSlope, formatUtcTime, stopLabel } from "../lib/format.ts";
import { routeLegs } from "../lib/legs.ts";
import { SLOPE_CLASS_LABEL } from "../lib/slope.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
import { useSite } from "../state/SiteContext.tsx";
import { LEVEL_ICON } from "../components/SafetyBadge.tsx";

/** One-page printable route card, A5 landscape. Everything on it comes from the route response. */
export function CardView({ onBackToPlan }: { onBackToPlan: () => void }) {
  const { state, stale } = usePlanner();
  const { site } = useSite();
  const route = state.route;

  const legs = useMemo(() => {
    if (!route) return [];
    const first = route.profile[0]?.dist_m ?? 0;
    return routeLegs(
      route.profile,
      [{ label: "S", distM: first }, ...route.stops.map((s, i) => ({ label: stopLabel(i), distM: s.dist_m }))],
      SLOPE_LIMITS,
    );
  }, [route]);

  if (!route) {
    return (
      <main className="card-screen">
        <div className="card-empty">
          <p className="empty__title">No route to print</p>
          <p className="muted">Plan a route first. The card is built from the computed route.</p>
          <button type="button" className="btn btn--primary" onClick={onBackToPlan}>
            <Icon name="route" /> Back to Plan
          </button>
        </div>
      </main>
    );
  }

  const computed = formatUtcTime(route.computed_at);

  return (
    <main className="card-screen">
      <div className="card-toolbar">
        {stale ? (
          <p className="notice notice--warn" role="status">
            <Icon name="alert" /> The points changed after this route was computed. Recalculate in Plan before printing.
          </p>
        ) : (
          <p className="muted">Preview of the printed page. A5 landscape.</p>
        )}
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>
          <Icon name="print" /> Print or save as PDF
        </button>
      </div>

      <article className="card" aria-label="Route card">
        <header className="card__head">
          <div>
            <h2 className="card__title">ARES route card</h2>
            <p className="card__sub">{site.name}</p>
          </div>
          <p className="card__meta mono">
            {dataSource === "mock" ? "Sample data, not real terrain" : "Live API"}
            {site.isTestData && " · Test data"}
            {computed && ` · Computed ${computed}`}
            {stale && " · Out of date"}
          </p>
        </header>

        <div className="card__grid">
          <div className="card__col">
            <section className="card__map" aria-label="Route map">
              <RouteSketch route={route} />
            </section>
          <section className="card__assumptions" aria-labelledby="card-assump">
            <h3 id="card-assump" className="card__h">Assumptions and sources</h3>
            {route.assumptions.length === 0 ? (
              <p className="card__muted">The route service returned no assumptions.</p>
            ) : (
              <ul>
                {route.assumptions.map((a) => (
                  <li key={a.name}>
                    <strong>{a.name}:</strong> <span className="mono">{a.value}</span> <span className="card__muted">(<SourceText text={a.source} />)</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          </div>

          <div className="card__col">
            <section aria-label="Summary">
              <dl className="card__stats">
                <div>
                  <dt>Length</dt>
                  <dd className="mono">{formatDistance(route.distance_m)}</dd>
                </div>
                <div>
                  <dt>Max slope</dt>
                  <dd className="mono">{formatSlope(route.max_slope_deg)}</dd>
                </div>
                <div>
                  <dt>Est. time</dt>
                  <dd className="mono">{formatDuration(route.est_time_s)}</dd>
                </div>
              </dl>
              <div className="card__safety">
                <SafetyBadge level={route.safety} />
                <span>{route.safety_reason}</span>
              </div>
            </section>

            <section aria-labelledby="card-stops">
              <h3 id="card-stops" className="card__h">Stops</h3>
              <table className="card__table">
                <thead>
                  <tr>
                    <th scope="col">Stop</th>
                    <th scope="col">Coordinates</th>
                    <th scope="col" className="num">At</th>
                  </tr>
                </thead>
                <tbody>
                  {route.polyline[0] && (
                    <tr>
                      <th scope="row">S Start</th>
                      <td className="mono">{formatCoordinates(route.polyline[0][1], route.polyline[0][0], 4)}</td>
                      <td className="mono num">0 m</td>
                    </tr>
                  )}
                  {route.stops.map((s, i) => (
                    <tr key={s.id}>
                      <th scope="row">
                        {stopLabel(i)} {s.name ?? ""}
                      </th>
                      <td className="mono">{formatCoordinates(s.lat, s.lon, 4)}</td>
                      <td className="mono num">{formatDistance(s.dist_m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section aria-labelledby="card-slopes">
              <h3 id="card-slopes" className="card__h">Slope by leg</h3>
              <table className="card__table">
                <thead>
                  <tr>
                    <th scope="col">Leg</th>
                    <th scope="col" className="num">Length</th>
                    <th scope="col" className="num">Max</th>
                    <th scope="col" className="num">Mean</th>
                    <th scope="col" className="num">Up / down</th>
                    <th scope="col">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {legs.map((l) => (
                    <tr key={`${l.fromLabel}-${l.toLabel}`}>
                      <th scope="row">
                        {l.fromLabel} to {l.toLabel}
                      </th>
                      <td className="mono num">{formatDistance(l.stats.lengthM)}</td>
                      <td className="mono num">{formatSlope(l.stats.maxSlopeDeg)}</td>
                      <td className="mono num">{formatSlope(l.stats.meanSlopeDeg)}</td>
                      <td className="mono num">
                        {formatSignedElevation(l.stats.elevGainM, "+")} / {formatSignedElevation(l.stats.elevLossM, "−")}
                      </td>
                      <td>
                        <span className={`card__class card__class--${l.cls}`}>
                          <Icon name={LEVEL_ICON[l.cls]} size={10} /> {SLOPE_CLASS_LABEL[l.cls]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="card__note">
                Classes: up to {SLOPE_LIMITS.cautionDeg}° within limits, up to {SLOPE_LIMITS.maxDeg}° steep, above that over limit.
              </p>
            </section>
          </div>
        </div>

      </article>
    </main>
  );
}
