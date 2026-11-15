import type { RouteResponse } from "../api/types.ts";
import { REFERENCES } from "../config/references.ts";
import { SLOPE_LIMITS } from "../config/route.ts";
import { useSite } from "../state/SiteContext.tsx";
import { SourceText } from "./SourceText.tsx";

const COST_FORMULA = "step cost = length × (1 + k × (slope ÷ limit)²)";

function Facts({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <dl className="facts">
      {rows.map(([k, v]) => (
        <div key={k} className="facts__row">
          <dt>{k}</dt>
          <dd className="mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The method behind the numbers, written down once: the cost formula, the grid, the limits, every
 * source with its link. Values that depend on the site come from its meta.json and from the route
 * response, not from this file; anything the data team has not checked says TO VERIFY.
 */
export function MethodPanel({ route }: { route: RouteResponse | null }) {
  const { site } = useSite();
  const cell = site.cellM === null ? "not stated" : `${site.cellM} m`;
  const windowM = site.slopeWindowM === null ? "not stated" : `${site.slopeWindowM} m`;

  return (
    <div className="panel__section method-panel">
      <section className="method" aria-label="How the route is chosen">
        <h3 className="drawer__subtitle">How the route is chosen</h3>
        <p className="muted">
          A* search over the slope grid, 8 neighbours. A cell steeper than the limit cannot be crossed. Each step costs
        </p>
        <p className="method__formula mono">{COST_FORMULA}</p>
        <ul className="method__list">
          <li>Balanced: k = 1. Fast: k = 0.5, so steeper shortcuts win more often.</li>
          <li>Safe: k = 1 with the {SLOPE_LIMITS.cautionDeg}° caution slope as the hard limit; if no path exists, the {SLOPE_LIMITS.maxDeg}° limit is used and the result says so.</li>
          <li>Time is distance divided by walking speed. The way back repeats the stops in reverse.</li>
          <li>NO-GO: no path, or the round trip is longer than the EVA limit. CAUTION: the steepest section is above {SLOPE_LIMITS.cautionDeg}°, or Safe fell back. Otherwise GO.</li>
        </ul>
      </section>

      <section className="method" aria-label="Terrain and limits">
        <h3 className="drawer__subtitle">Terrain and limits</h3>
        <Facts
          rows={[
            ["Grid cell", cell],
            ["Slope window", windowM],
            ["Caution slope", `${SLOPE_LIMITS.cautionDeg}°`],
            ["Route limit", `${SLOPE_LIMITS.maxDeg}°`],
            ...(site.dtmProductId ? ([["Terrain model", site.dtmProductId]] as const) : []),
          ]}
        />
        <p className="muted">
          Slope is the central difference of elevation smoothed over about 5 m, taken across the window above. {SLOPE_LIMITS.cautionDeg}° and {SLOPE_LIMITS.maxDeg}° are ARES planning values, lunar analogs, not Mars suit limits.
        </p>
      </section>

      <section className="method" aria-label="Assumptions">
        <h3 className="drawer__subtitle">Assumptions of this route</h3>
        {route === null ? (
          <p className="muted">Shown once a route is computed.</p>
        ) : route.assumptions.length === 0 ? (
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
                    <SourceText text={a.source} label="TO VERIFY" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {site.sources.length > 0 && (
        <section className="method" aria-label="Data sources">
          <h3 className="drawer__subtitle">Data sources</h3>
          <ul className="source-list">
            {site.sources.map((src) => (
              <li key={src}>{src}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="method" aria-label="References">
        <h3 className="drawer__subtitle">References</h3>
        <ol className="source-list method__refs">
          {REFERENCES.map((r) => (
            <li key={r.n} value={r.n}>
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.citation}
              </a>
              {r.design && <span className="tag"> Design reference</span>}
            </li>
          ))}
        </ol>
      </section>

      {site.isTestData && <p className="muted drawer__foot">This grid is generated test data, not measured terrain.</p>}
    </div>
  );
}
