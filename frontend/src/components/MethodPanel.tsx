import type { RouteResponse } from "../api/types.ts";
import { fillMethodText, METHOD, type MethodValues } from "../content/method.ts";
import { REFERENCES } from "../config/references.ts";
import { SLOPE_LIMITS } from "../config/route.ts";
import { validationView } from "../lib/validationView.ts";
import { useSite } from "../state/SiteContext.tsx";
import { useValidation } from "../state/useValidation.ts";
import { SourceText } from "./SourceText.tsx";

function valuesFor(site: ReturnType<typeof useSite>["site"]): MethodValues {
  const metres = (v: number | null) => (v === null ? "not stated" : `${v} m`);
  return {
    cellM: metres(site.cellM),
    slopeWindowM: metres(site.slopeWindowM),
    cautionDeg: `${SLOPE_LIMITS.cautionDeg}°`,
    maxDeg: `${SLOPE_LIMITS.maxDeg}°`,
    dtm: site.dtmProductId ?? "terrain model not stated",
  };
}

/**
 * The method behind the numbers: the sections of content/method.ts, the assumptions of the current
 * route (each with an unverified source tagged TO VERIFY), the data sources and every reference.
 */
export function MethodPanel({ route }: { route: RouteResponse | null }) {
  const { site } = useSite();
  const values = valuesFor(site);
  const fill = (t: string) => fillMethodText(t, values);

  return (
    <div className="method-panel">
      <p className="muted">{METHOD.intro}</p>

      {METHOD.sections.map((s) => (
        <section key={s.id} className="method" aria-labelledby={`method-${s.id}`}>
          <h3 id={`method-${s.id}`} className="drawer__subtitle">
            {s.title}
          </h3>
          {s.paragraphs.map((p) => (
            <p key={p} className="muted">
              {fill(p)}
            </p>
          ))}
          {s.formula && <p className="method__formula mono">{s.formula}</p>}
          {s.bullets && (
            <ul className="method__list">
              {s.bullets.map((b) => (
                <li key={b}>{fill(b)}</li>
              ))}
            </ul>
          )}
          {s.id === "limits" && <Assumptions route={route} />}
          {s.id === "validation" && <Validation siteId={site.id} />}
        </section>
      ))}

      {site.sources.length > 0 && (
        <section className="method" aria-labelledby="method-data">
          <h3 id="method-data" className="drawer__subtitle">
            Data sources
          </h3>
          <ul className="source-list">
            {site.sources.map((src) => (
              <li key={src}>{src}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="method" aria-labelledby="method-refs">
        <h3 id="method-refs" className="drawer__subtitle">
          References
        </h3>
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

/** The assumptions the route service used. A source marked TO VERIFY gets a tag, so no unchecked number passes as checked. */
function Assumptions({ route }: { route: RouteResponse | null }) {
  if (route === null) return <p className="muted">The assumptions of the route appear here once a route is computed.</p>;
  if (route.assumptions.length === 0) return <p className="muted">The service returned no assumptions.</p>;
  return (
    <table className="table">
      <caption className="sr-only">Assumptions of this route and where each comes from</caption>
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
  );
}

/** The comparison with Curiosity's traverse, read from GET /validation: its own numbers, or why there are none. */
function Validation({ siteId }: { siteId: string }) {
  const view = validationView(useValidation(siteId));
  if (view.kind === "unavailable") {
    return (
      <p className="validation__none" role="status">
        <span className="tag">Not available</span> {view.reason}
      </p>
    );
  }
  if (view.kind === "not-computed") {
    return (
      <p className="validation__none" role="status">
        <span className="tag tag--warn">No result</span> {view.reason}
      </p>
    );
  }
  return (
    <div className="validation">
      <p className="muted">
        {view.n.toLocaleString("en-GB")} points of the traverse inside the site. Differences are the traverse height minus our elevation, in metres. Offset between the two references: <span className="mono">{view.offset}</span>.
      </p>
      <table className="table">
        <caption className="sr-only">Our elevation against the heights of Curiosity's traverse</caption>
        <thead>
          <tr>
            <th scope="col">Difference</th>
            <th scope="col">Mean</th>
            <th scope="col">RMSE</th>
            <th scope="col">Largest</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td className="mono">{r.mean}</td>
              <td className="mono">{r.rmse}</td>
              <td className="mono">{r.max}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Source:{" "}
        <a href={view.sourceUrl} target="_blank" rel="noreferrer">
          NASA/JPL MSL traverse
        </a>
        , fetched {view.fetched}.
      </p>
    </div>
  );
}
