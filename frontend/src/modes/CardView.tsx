import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { dataSource } from "../api/client.ts";
import type { SafetyLevel } from "../api/types.ts";
import { Icon } from "../components/Icon.tsx";
import { RouteSketch } from "../components/RouteSketch.tsx";
import { ReadinessBadge } from "../components/RouteStatus.tsx";
import { formatLimitDuration, returnLimitText } from "../components/ReturnCheck.tsx";
import { LEVEL_ICON, SafetyBadge } from "../components/SafetyBadge.tsx";
import { SourceText } from "../components/SourceText.tsx";
import {
  GCR_DOSE_EQUIVALENT_MSV_PER_DAY,
  RADIATION_CITATION,
  RADIATION_LABEL,
  RADIATION_NOTE,
} from "../config/radiation.ts";
import { REFERENCES } from "../config/references.ts";
import { MAX_DISTANCE_FROM_START_M, SLOPE_LIMITS } from "../config/route.ts";
import {
  documentId,
  formatCoordinates,
  formatDistance,
  formatDuration,
  formatSignedElevation,
  formatSlope,
  formatUtcStamp,
  stopLabel,
} from "../lib/format.ts";
import { fitScale, stillOverflows } from "../lib/fitPage.ts";
import { routeLegs } from "../lib/legs.ts";
import { estimatedDoseMsv, formatDose } from "../lib/radiation.ts";
import { sectionStats } from "../lib/profile.ts";
import { routeSpeedMps, safetyMargins, walkBackTimeS } from "../lib/safety.ts";
import { SLOPE_CLASS_LABEL } from "../lib/slope.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
import { useSite, useSiteScienceContext } from "../state/SiteContext.tsx";

/** Status words on the printed card; the planner screen uses longer ones. */
const CARD_STATUS: Record<SafetyLevel, string> = {
  ok: "Gentle, under 10°",
  caution: "Proceed with caution",
  avoid: "Over limit",
};

const dash = "–";

function StatusMark({ ok }: { ok: boolean }) {
  return (
    <span className={`doc__class doc__class--${ok ? "ok" : "avoid"}`}>
      <Icon name={ok ? "check" : "octagon"} size={10} /> {ok ? "Within limit" : "Over limit"}
    </span>
  );
}

/** One-page A4 route card. Every number on it comes from the route response or the site data. */
export function CardView({ onBackToPlan }: { onBackToPlan: () => void }) {
  const { state, stale } = usePlanner();
  const { site } = useSite();
  const context = useSiteScienceContext();
  const route = state.route;

  // One A4 sheet is 297 mm. When the content is taller (more stops, longer sources) the whole card is
  // scaled to fit, so nothing is cut off at the bottom; the preview on screen shows the same.
  const docRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = docRef.current;
    if (!el) return;
    const fit = () => {
      el.style.setProperty("--doc-fit", "1");
      // 1.5 % of margin: the print layout can differ from the screen one by a few pixels.
      const page = ((297 * 96) / 25.4) * 0.985;
      const content = el.scrollHeight;
      el.style.setProperty("--doc-fit", String(fitScale(content, page)));
      if (stillOverflows(content, page)) console.warn("The route card is too long for one page even when scaled down");
    };
    fit();
    void document.fonts?.ready.then(fit);
    window.addEventListener("beforeprint", fit);
    return () => window.removeEventListener("beforeprint", fit);
  }, [route, stale, context, site]);

  const model = useMemo(() => {
    if (!route) return null;
    const first = route.profile[0]?.dist_m ?? 0;
    const last = route.profile[route.profile.length - 1]?.dist_m ?? first;
    const legs = routeLegs(
      route.profile,
      [{ label: "S", distM: first }, ...route.stops.map((s, i) => ({ label: stopLabel(i), distM: s.dist_m }))],
      SLOPE_LIMITS,
    );
    const margins = safetyMargins(route.polyline);
    const speed = routeSpeedMps(route.distance_m, route.est_time_s);
    return {
      legs,
      whole: sectionStats(route.profile, first, last),
      margins,
      speedKmh: speed === null ? null : speed * 3.6,
      walkBackS: margins ? walkBackTimeS(margins, speed) : null,
    };
  }, [route]);

  if (!route || !model) {
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

  const { legs, whole, margins, speedKmh, walkBackS } = model;
  const start = route.polyline[0];
  const returnCheck = route.return_check ?? null;
  const overLimit = margins ? margins.farthestM > MAX_DISTANCE_FROM_START_M : false;
  const dataNotes = [
    dataSource === "mock" && "Sample data",
    site.isTestData && "Test data",
    stale && "Out of date",
  ].filter(Boolean).join(", ");

  return (
    <main className="card-screen">
      <div className="card-toolbar">
        {stale ? (
          <p className="notice notice--warn" role="status">
            <Icon name="alert" /> The points changed after this route was computed. Recalculate in Plan before printing.
          </p>
        ) : (
          <p className="muted">Preview of the printed page. A4 portrait.</p>
        )}
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>
          <Icon name="print" /> Print or save as PDF
        </button>
      </div>

      <article ref={docRef} className="doc" aria-label="ARES route card" style={{ "--doc-fit": 1 } as CSSProperties}>
        <header className="doc__head">
          <div>
            <h2 className="doc__title">ARES ROUTE CARD</h2>
            <p className="doc__site">{site.name}</p>
          </div>
          <dl className="doc__meta">
            <div>
              <dt>Document ID</dt>
              <dd className="mono">{documentId(route.computed_at) ?? dash}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{site.preliminary ? "Preliminary" : "Issued"}</dd>
            </div>
            <div>
              <dt>Computed</dt>
              <dd className="mono">{formatUtcStamp(route.computed_at) ?? dash}</dd>
            </div>
            {dataNotes && (
              <div>
                <dt>Data mode</dt>
                <dd>{dataNotes}</dd>
              </div>
            )}
          </dl>
        </header>

        <section className="doc__section" aria-labelledby="doc-summary">
          <h3 id="doc-summary" className="doc__h">1. Route summary</h3>
          <dl className="doc__stats">
            <div>
              <dt>Length</dt>
              <dd className="mono">{formatDistance(route.distance_m)}</dd>
            </div>
            <div>
              <dt>Max slope</dt>
              <dd className="mono">{formatSlope(route.max_slope_deg)}</dd>
            </div>
            <div>
              <dt>Mean slope</dt>
              <dd className="mono">{whole ? formatSlope(whole.meanSlopeDeg) : dash}</dd>
            </div>
            <div>
              <dt>Est. time</dt>
              <dd className="mono">{formatDuration(route.est_time_s)}</dd>
            </div>
            <div>
              <dt>Elevation gain</dt>
              <dd className="mono">{whole ? formatSignedElevation(whole.elevGainM, "+") : dash}</dd>
            </div>
            <div>
              <dt>Elevation loss</dt>
              <dd className="mono">{whole ? formatSignedElevation(whole.elevLossM, "−") : dash}</dd>
            </div>
          </dl>
          <div className="doc__status">
            <SafetyBadge level={route.safety} label={CARD_STATUS[route.safety]} />
            <span>{route.safety_reason}</span>
          </div>
          {route.readiness && (
            <div className="doc__status doc__status--readiness">
              <ReadinessBadge level={route.readiness.level} />
              <span>
                <strong>EVA readiness.</strong> {route.readiness.reasons.join(" ")}
              </span>
            </div>
          )}
        </section>

        <div className="doc__cols">
          <section className="doc__section" aria-labelledby="doc-map">
            <h3 id="doc-map" className="doc__h">2. Map</h3>
            <RouteSketch route={route} />
          </section>

          <div className="doc__stack">
            <section className="doc__section" aria-labelledby="doc-stops">
              <h3 id="doc-stops" className="doc__h">3. Stops</h3>
              <table className="doc__table">
                <thead>
                  <tr>
                    <th scope="col">Stop</th>
                    <th scope="col">Coordinates</th>
                    <th scope="col" className="num">At</th>
                  </tr>
                </thead>
                <tbody>
                  {start && (
                    <tr>
                      <th scope="row">S Start</th>
                      <td className="mono">{formatCoordinates(start[1], start[0], 4)}</td>
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

            <section className="doc__section" aria-labelledby="doc-legs">
              <h3 id="doc-legs" className="doc__h">4. Slope by leg</h3>
              <table className="doc__table">
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
                        <span className={`doc__class doc__class--${l.cls}`}>
                          <Icon name={LEVEL_ICON[l.cls]} size={10} /> {SLOPE_CLASS_LABEL[l.cls]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="doc__note">
                Classes: up to {SLOPE_LIMITS.cautionDeg}° within limits, up to {SLOPE_LIMITS.maxDeg}° steep, above that over limit.
              </p>
            </section>
          </div>
        </div>

        <div className="doc__cols doc__cols--even">
          <section className="doc__section" aria-labelledby="doc-margins">
            <h3 id="doc-margins" className="doc__h">5. Safety margins</h3>
            <table className="doc__table doc__table--kv">
              <tbody>
                <tr>
                  <th scope="row">Farthest from start, straight line</th>
                  <td className="mono">
                    {margins ? formatDistance(margins.farthestM) : dash} of {formatDistance(MAX_DISTANCE_FROM_START_M)} limit
                  </td>
                </tr>
                <tr>
                  <th scope="row">Distance limit</th>
                  <td>
                    <span className={`doc__class doc__class--${overLimit ? "avoid" : "ok"}`}>
                      <Icon name={overLimit ? "octagon" : "check"} size={10} /> {overLimit ? "Over limit" : "Within limit"}
                    </span>
                  </td>
                </tr>
                {returnCheck ? (
                  <tr>
                    <th scope="row">Longest walk back to start</th>
                    <td>
                      <span className="mono">
                        {formatDistance(returnCheck.worst_return_m)} · {formatDuration(returnCheck.worst_return_s)} of{" "}
                        {returnLimitText(returnCheck)}
                      </span>{" "}
                      <StatusMark ok={returnCheck.ok} />
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <th scope="row">Walk back to start from there</th>
                    <td className="mono">{walkBackS === null ? dash : formatDuration(walkBackS)}</td>
                  </tr>
                )}
                {route.eva_time_s != null && route.eva_limit_s != null && (
                  <tr>
                    <th scope="row">EVA time</th>
                    <td>
                      <span className="mono">
                        {formatDuration(route.eva_time_s)} of {formatLimitDuration(route.eva_limit_s)}
                      </span>{" "}
                      <StatusMark ok={route.eva_time_s <= route.eva_limit_s} />
                    </td>
                  </tr>
                )}
                <tr>
                  <th scope="row">{RADIATION_LABEL}</th>
                  <td className="mono">
                    {formatDose(estimatedDoseMsv(GCR_DOSE_EQUIVALENT_MSV_PER_DAY, route.est_time_s))} [5]
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="doc__note">
              {returnCheck
                ? "Walk back: shortest walkable way to the start from every route point, same slope limit."
                : `Walk back retraces the planned route at the route's own speed${speedKmh === null ? "" : ` (${speedKmh.toFixed(1)} km/h)`}.`}
              {route.eva_time_s != null && route.round_trip_time_s != null
                ? ` EVA time: round trip ${formatDuration(route.round_trip_time_s)} + ${(route.stops_time_s ?? 0) > 0 ? formatDuration(route.stops_time_s ?? 0) : "0 min"} at stops.`
                : ""} Dose: {GCR_DOSE_EQUIVALENT_MSV_PER_DAY} mSv/day
              ({RADIATION_CITATION.period}) x walking time. {RADIATION_NOTE}
            </p>
          </section>

          <section className="doc__section" aria-labelledby="doc-terrain">
            <h3 id="doc-terrain" className="doc__h">6. Terrain data</h3>
            <table className="doc__table doc__table--kv">
              <tbody>
                <tr>
                  <th scope="row">Terrain model</th>
                  <td>{site.sources[0] ?? (site.dtmProductId ? `HiRISE DTM ${site.dtmProductId}` : dash)}</td>
                </tr>
                <tr>
                  <th scope="row">Grid cell</th>
                  <td className="mono">{site.cellM === null ? dash : `${site.cellM} m`}</td>
                </tr>
                <tr>
                  <th scope="row">Slope window</th>
                  <td className="mono">{site.slopeWindowM === null ? dash : `${site.slopeWindowM} m`}</td>
                </tr>
              </tbody>
            </table>
            {context && (
              <div className="doc__context">
                <h3 id="doc-context" className="doc__h">7. {context.title}</h3>
                <p>
                  {context.text}{" "}
                  {context.sources
                    .map((s) => REFERENCES.find((r) => r.url === s.url)?.n)
                    .filter((n) => n !== undefined)
                    .map((n) => `[${n}]`)
                    .join(" ")}
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="doc__section" aria-labelledby="doc-assump">
          <h3 id="doc-assump" className="doc__h">8. Assumptions and sources</h3>
          {route.assumptions.length === 0 ? (
            <p className="doc__muted">The route service returned no assumptions.</p>
          ) : (
            <table className="doc__table doc__table--assump">
              <tbody>
                {route.assumptions.map((a) => (
                  <tr key={a.name}>
                    <th scope="row">{a.name}</th>
                    <td className="mono">{a.value}</td>
                    <td>
                      <SourceText text={a.source} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <ol className="doc__refs">
            {REFERENCES.filter((r) => !r.design).map((r) => (
              <li key={r.n} value={r.n}>
                [{r.n}] {r.citation} <span className="mono">{r.url}</span>
              </li>
            ))}
          </ol>
        </section>

        <footer className="doc__foot">
          <span>Planning aid only, not certified for operational use.</span>
          <span>Page 1/1</span>
        </footer>
      </article>
    </main>
  );
}
