import { parseGlobalSites, type GlobalSite } from "../lib/globalSites.ts";

/** Markers of the Mars overview, served from public/data/sites_global.json. */
export async function fetchGlobalSites(signal?: AbortSignal): Promise<GlobalSite[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/sites_global.json`, { signal });
  if (!res.ok) throw new Error(`sites_global.json answered ${res.status}`);
  const { sites, rejected } = parseGlobalSites(await res.json());
  if (rejected.length > 0) console.warn("Some overview markers were left out:", rejected);
  return sites;
}
