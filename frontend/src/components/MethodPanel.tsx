import type { RouteResponse } from "../api/types.ts";
import { fillMethodText, METHOD, type MethodValues } from "../content/method.ts";
import { REFERENCES } from "../config/references.ts";
import { SLOPE_LIMITS } from "../config/route.ts";
import { useSite } from "../state/SiteContext.tsx";
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
