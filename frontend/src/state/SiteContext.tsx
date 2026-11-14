import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, fetchSiteMeta } from "../api/client.ts";
import type { SiteEntry } from "../api/types.ts";
import { DEFAULT_SITE_ID, siteCentre, siteFromMeta, type SiteConfig } from "../config/site.ts";
import { viewportStore } from "./viewportStore.ts";

export type SitesStatus = "loading" | "ready" | "error";

interface SiteModel {
  site: SiteConfig;
  /** Selection list from GET /sites. It is optional: the map works without it. */
  sites: { status: SitesStatus; entries: readonly SiteEntry[]; retry: () => void };
  /** Open another site. The plan is cleared: a plan belongs to one site. */
  switchSite: (id: string) => void;
  /** Id of the site being loaded, while a switch is in flight. */
  switching: string | null;
  /** Plain-language reason the last switch failed, or null. */
  switchError: string | null;
}

const Ctx = createContext<SiteModel | null>(null);

export function useSite(): SiteModel {
  const value = useContext(Ctx);
  if (!value) throw new Error("useSite must be used inside <SiteProvider>");
  return value;
}

const SITE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The site named by ?site= in the URL, if it looks like a site id; otherwise the default. */
function initialSiteId(): string {
  const id = new URLSearchParams(window.location.search).get("site");
  return id && SITE_ID.test(id) ? id : DEFAULT_SITE_ID;
}

type FirstLoad = { status: "loading" } | { status: "error"; message: string };

/**
 * Loads /app/data/<site>/meta.json before anything that needs the site renders, so the map opens
 * on the real centre and zoom instead of a placeholder. Then loads the site list in the background.
 * Switching sites keeps the old site on screen until the new one has loaded, then remounts the
 * planner and map for it (the children are keyed by site id).
 */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [first, setFirst] = useState<FirstLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [sites, setSites] = useState<{ status: SitesStatus; entries: readonly SiteEntry[] }>({ status: "loading", entries: [] });
  const [sitesAttempt, setSitesAttempt] = useState(0);

  const show = useCallback((config: SiteConfig) => {
    viewportStore.setCentre(siteCentre(config));
    setSite(config);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setFirst({ status: "loading" });
    fetchSiteMeta(initialSiteId(), ctrl.signal)
      .then((m) => show(siteFromMeta(m)))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        console.error("Failed to load site metadata", e);
        setFirst({ status: "error", message: "check your connection and retry" });
      });
    return () => ctrl.abort();
  }, [attempt, show]);

  const ready = site !== null;
  useEffect(() => {
    if (!ready) return;
    const ctrl = new AbortController();
    setSites({ status: "loading", entries: [] });
    api
      .sites(ctrl.signal)
      .then((res) => {
        if (!ctrl.signal.aborted) setSites({ status: "ready", entries: res.sites });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        console.error("Failed to load the site list", e);
        setSites({ status: "error", entries: [] });
      });
    return () => ctrl.abort();
  }, [ready, sitesAttempt]);

  const switchSite = useCallback(
    (id: string) => {
      if (!SITE_ID.test(id) || switching || id === site?.id) return;
      setSwitching(id);
      setSwitchError(null);
      fetchSiteMeta(id)
        .then((m) => {
          // The old plan and its link do not apply to another site.
          window.history.replaceState(null, "", `${window.location.pathname}?site=${encodeURIComponent(id)}`);
          show(siteFromMeta(m));
        })
        .catch((e: unknown) => {
          console.warn("Could not open site", id, e);
          setSwitchError("No terrain data is published for that site yet.");
        })
        .finally(() => setSwitching(null));
    },
    [show, site?.id, switching],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const retrySites = useCallback(() => setSitesAttempt((n) => n + 1), []);
  const value = useMemo<SiteModel | null>(
    () => (site ? { site, sites: { ...sites, retry: retrySites }, switchSite, switching, switchError } : null),
    [site, sites, retrySites, switchSite, switching, switchError],
  );

  if (!value) {
    if (first.status === "error") {
      return (
        <div className="boot" role="alert">
          <p>Site data could not be loaded ({first.message})</p>
          <button type="button" className="btn" onClick={retry}>
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="boot" role="status">
        <span className="spinner" aria-hidden="true" /> Loading site data
      </div>
    );
  }
  return (
    <Ctx.Provider value={value}>
      <Fragment key={value.site.id}>{children}</Fragment>
    </Ctx.Provider>
  );
}
