import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, fetchSiteMeta } from "../api/client.ts";
import type { SiteEntry } from "../api/types.ts";
import { DEFAULT_SITE_ID, siteCentre, siteFromMeta, type SiteConfig } from "../config/site.ts";
import { viewportStore } from "./viewportStore.ts";

export type SitesStatus = "loading" | "ready" | "error";

interface SiteModel {
  site: SiteConfig;
  /** Selection list from GET /sites. It is optional: the map works without it. */
  sites: { status: SitesStatus; entries: readonly SiteEntry[] };
}

const Ctx = createContext<SiteModel | null>(null);

export function useSite(): SiteModel {
  const value = useContext(Ctx);
  if (!value) throw new Error("useSite must be used inside <SiteProvider>");
  return value;
}

type MetaState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; site: SiteConfig };

/**
 * Loads /app/data/<site>/meta.json before anything that needs the site renders, so the map opens
 * on the real centre and zoom instead of a placeholder. Then loads the site list in the background.
 */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<MetaState>({ status: "loading" });
  const [sites, setSites] = useState<SiteModel["sites"]>({ status: "loading", entries: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setMeta({ status: "loading" });
    fetchSiteMeta(DEFAULT_SITE_ID, ctrl.signal)
      .then((m) => {
        const site = siteFromMeta(m);
        viewportStore.setCentre(siteCentre(site));
        setMeta({ status: "ready", site });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        console.error("Failed to load site metadata", e);
        setMeta({ status: "error", message: e instanceof Error && e.name === "ApiError" ? "check your connection and retry" : "unexpected error" });
      });
    return () => ctrl.abort();
  }, [attempt]);

  useEffect(() => {
    if (meta.status !== "ready") return;
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
  }, [meta.status]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const value = useMemo(() => (meta.status === "ready" ? { site: meta.site, sites } : null), [meta, sites]);

  if (meta.status === "loading") {
    return (
      <div className="boot" role="status">
        <span className="spinner" aria-hidden="true" /> Loading site data
      </div>
    );
  }
  if (meta.status === "error" || !value) {
    return (
      <div className="boot" role="alert">
        <p>Site data could not be loaded{meta.status === "error" ? ` (${meta.message})` : ""}</p>
        <button type="button" className="btn" onClick={retry}>
          Retry
        </button>
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
