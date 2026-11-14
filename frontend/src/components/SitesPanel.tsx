import { useSite } from "../state/SiteContext.tsx";
import { Icon } from "./Icon.tsx";

/** Pick another site. Each site has its own terrain grid; the current one is marked. */
export function SitesPanel() {
  const { site, sites, switchSite, switching, switchError } = useSite();

  return (
    <section className="panel panel--left" aria-labelledby="sites-title">
      <header className="panel__head">
        <h2 id="sites-title" className="sr-only">
          Sites
        </h2>
        {sites.status === "ready" && (
          <span className="panel__meta mono">
            {sites.entries.length} {sites.entries.length === 1 ? "site" : "sites"}
          </span>
        )}
      </header>

      {sites.status === "loading" && (
        <p className="muted" role="status">
          <span className="spinner" aria-hidden="true" /> Loading sites
        </p>
      )}
      {sites.status === "error" && (
        <div className="notice notice--error" role="alert">
          <Icon name="wifiOff" />
          <span>The site list could not be loaded</span>
          <button type="button" className="btn btn--ghost" onClick={sites.retry}>
            <Icon name="refresh" /> Retry
          </button>
        </div>
      )}
      {switchError && (
        <p className="notice notice--warn" role="status">
          <Icon name="alert" /> {switchError}
        </p>
      )}

      <ul className="site-list">
        {sites.entries.map((entry) => {
          const current = entry.id === site.id;
          const busy = switching === entry.id;
          return (
            <li key={entry.id}>
              <button
                type="button"
                className={`site-row${current ? " site-row--current" : ""}`}
                aria-current={current ? "true" : undefined}
                disabled={switching !== null}
                onClick={() => switchSite(entry.id)}
              >
                <span className="site-row__name">{entry.name}</span>
                <span className="site-row__meta">
                  {entry.groups.length} {entry.groups.length === 1 ? "target group" : "target groups"}
                  {" · "}
                  {entry.stops.length} {entry.stops.length === 1 ? "target" : "targets"}
                </span>
                {current && <span className="tag">Current</span>}
                {busy && <span className="spinner" aria-label="Loading" />}
              </button>
            </li>
          );
        })}
      </ul>
      {sites.status === "ready" && sites.entries.length <= 1 && (
        <p className="muted">Only one site has terrain data so far.</p>
      )}
    </section>
  );
}
