// Types mirror backend/app/schemas/. Route types live in ./types.ts (proposal, see docs/api.md).
import { REQUEST_TIMEOUT_MS } from "../config/route.ts";
import { siteFileUrl } from "./siteFiles.ts";
import { parseLayersResponse, parseRouteResponse, parseSiteMeta, parseSitesResponse } from "./validate.ts";
import {
  ApiError,
  type LayersResponse,
  type RouteRequest,
  type RouteResponse,
  type SiteMeta,
  type SitesResponse,
} from "./types.ts";

// Dev: the backend on :8000. Production build: same origin, where Vercel routes /api/* to the
// backend service. VITE_API_URL overrides both (an empty string also means same origin).
const BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:8000")) + "/api/v1";

/**
 * "mock" only in a dev server started with VITE_USE_MOCK=true. A production build ignores the
 * variable, so the mock module is never reachable there. The UI shows "Sample data" for "mock".
 */
export const dataSource: "mock" | "live" = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "true" ? "mock" : "live";

/** The user-facing reason of a 422 answer, or null when the body does not have one. */
async function readDetail(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    const detail = typeof body === "object" && body !== null ? (body as { detail?: unknown }).detail : null;
    return typeof detail === "string" && detail.trim() !== "" ? detail.trim().slice(0, 300) : null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const onCallerAbort = () => timeout.abort();
  signal?.addEventListener("abort", onCallerAbort);

  try {
    const res = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...init,
      signal: timeout.signal,
    });
    if (!res.ok) throw new ApiError("http", `HTTP ${res.status}`, res.status, res.status === 422 ? await readDetail(res) : null);
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError("invalid", "Response was not valid JSON");
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (signal?.aborted) throw new ApiError("aborted", "Request cancelled");
    if (timeout.signal.aborted) throw new ApiError("timeout", "Request timed out");
    throw new ApiError("network", "Network error");
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}

/** Static JSON next to the app, not the API: /app/data/<site>/meta.json. */
export async function fetchSiteMeta(siteId: string, signal?: AbortSignal): Promise<SiteMeta> {
  let res: Response;
  try {
    res = await fetch(siteFileUrl(siteId, "meta.json"), { signal });
  } catch {
    throw new ApiError(signal?.aborted ? "aborted" : "network", signal?.aborted ? "Request cancelled" : "Network error");
  }
  if (!res.ok) throw new ApiError("http", `HTTP ${res.status}`, res.status);
  try {
    return parseSiteMeta(await res.json());
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("invalid", "Site metadata was not valid JSON");
  }
}

export const api = {
  route: async (body: RouteRequest, signal?: AbortSignal): Promise<RouteResponse> => {
    if (dataSource === "mock") {
      const { mockRoute } = await import("./mock.ts");
      return mockRoute(body, signal);
    }
    return parseRouteResponse(await request<unknown>("/route", { method: "POST", body: JSON.stringify(body) }, signal));
  },

  sites: async (signal?: AbortSignal): Promise<SitesResponse> => {
    if (dataSource === "mock") {
      const { mockSites } = await import("./mock.ts");
      return mockSites(signal);
    }
    return parseSitesResponse(await request<unknown>("/sites", undefined, signal));
  },

  layers: async (signal?: AbortSignal): Promise<LayersResponse> => {
    if (dataSource === "mock") {
      const { mockLayers } = await import("./mock.ts");
      return mockLayers(signal);
    }
    return parseLayersResponse(await request<unknown>("/layers", undefined, signal));
  },
};
