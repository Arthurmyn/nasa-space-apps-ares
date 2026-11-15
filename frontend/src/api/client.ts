// Types mirror backend/app/schemas/. Route types live in ./types.ts (proposal, see docs/api.md).
import { requestJson } from "./request.ts";
import { siteFileUrl } from "./siteFiles.ts";
import { parseConditions, parseValidation, parseLayersResponse, parseRouteResponse, parseSensitivityResponse, parseSiteMeta, parseSitesResponse, parseThermalInfo } from "./validate.ts";
import {
  ApiError,
  type ConditionsResponse,
  type ValidationResponse,
  type LayersResponse,
  type RouteRequest,
  type RouteResponse,
  type SensitivityResponse,
  type SiteMeta,
  type SitesResponse,
  type ThermalInfo,
} from "./types.ts";

// Dev: the backend on :8000. Production build: same origin, where Caddy routes /api/* to the
// backend (see deploy/Caddyfile). VITE_API_URL overrides both (an empty string also means same origin).
const BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:8000")) + "/api/v1";

/** Full URL of an API path such as "/donki". */
export const apiUrl = (path: string): string => BASE + path;

/**
 * "mock" only in a dev server started with VITE_USE_MOCK=true. A production build ignores the
 * variable, so the mock module is never reachable there. The UI shows "Sample data" for "mock".
 */
export const dataSource: "mock" | "live" = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "true" ? "mock" : "live";

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

/** Legend data of the thermal layer: static JSON next to the layer image. */
export async function fetchThermalInfo(siteId: string, signal?: AbortSignal): Promise<ThermalInfo> {
  let res: Response;
  try {
    res = await fetch(siteFileUrl(siteId, "thermal.json"), { signal });
  } catch {
    throw new ApiError(signal?.aborted ? "aborted" : "network", signal?.aborted ? "Request cancelled" : "Network error");
  }
  if (!res.ok) throw new ApiError("http", `HTTP ${res.status}`, res.status);
  try {
    return parseThermalInfo(await res.json());
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("invalid", "Thermal layer info was not valid JSON");
  }
}

export const api = {
  route: async (body: RouteRequest, signal?: AbortSignal): Promise<RouteResponse> => {
    if (dataSource === "mock") {
      const { mockRoute } = await import("./mock.ts");
      return mockRoute(body, signal);
    }
    return requestJson(BASE + "/route", { method: "POST", body: JSON.stringify(body) }, signal, parseRouteResponse);
  },

  sensitivity: async (body: RouteRequest, signal?: AbortSignal): Promise<SensitivityResponse> => {
    if (dataSource === "mock") {
      const { mockSensitivity } = await import("./mock.ts");
      return mockSensitivity(body, signal);
    }
    return requestJson(BASE + "/route/sensitivity", { method: "POST", body: JSON.stringify(body) }, signal, parseSensitivityResponse);
  },

  /** Never throws for "no data": a failed or unavailable feed comes back as { available: false }. */
  conditions: async (signal?: AbortSignal): Promise<ConditionsResponse> => {
    if (dataSource === "mock") {
      const { mockConditions } = await import("./mock.ts");
      return mockConditions(signal);
    }
    try {
      return await requestJson(BASE + "/conditions", undefined, signal, parseConditions);
    } catch (e) {
      if (signal?.aborted) throw e;
      console.warn("Conditions request failed", e);
      return { available: false, reason: "The conditions service could not be reached" };
    }
  },

  /** Our elevation against Curiosity's traverse. Never throws for "no data": a failure comes back as { available: false }. */
  validation: async (siteId: string, signal?: AbortSignal): Promise<ValidationResponse> => {
    if (dataSource === "mock") {
      const { mockValidation } = await import("./mock.ts");
      return mockValidation(signal);
    }
    try {
      return await requestJson(`${BASE}/validation?site_id=${encodeURIComponent(siteId)}`, undefined, signal, parseValidation);
    } catch (e) {
      if (signal?.aborted) throw e;
      console.warn("Validation request failed", e);
      const older = e instanceof ApiError && e.status === 404;
      return { available: false, reason: older ? "This server has no validation endpoint yet" : "The validation service could not be reached" };
    }
  },

  sites: async (signal?: AbortSignal): Promise<SitesResponse> => {
    if (dataSource === "mock") {
      const { mockSites } = await import("./mock.ts");
      return mockSites(signal);
    }
    return requestJson(BASE + "/sites", undefined, signal, parseSitesResponse);
  },

  layers: async (siteId: string, signal?: AbortSignal): Promise<LayersResponse> => {
    if (dataSource === "mock") {
      const { mockLayers } = await import("./mock.ts");
      return mockLayers(signal);
    }
    return requestJson(`${BASE}/layers?site_id=${encodeURIComponent(siteId)}`, undefined, signal, parseLayersResponse);
  },
};
