// Types mirror backend/app/schemas/. Route types live in ./types.ts (proposal, see docs/api.md).
import { REQUEST_TIMEOUT_MS } from "../config/route.ts";
import { parseLayersResponse, parseRouteResponse } from "./validate.ts";
import {
  ApiError,
  type LayersResponse,
  type RouteRequest,
  type RouteResponse,
} from "./types.ts";

// Dev: the backend on :8000. Production build: same origin, where Vercel routes /api/* to the
// backend service. VITE_API_URL overrides both (an empty string also means same origin).
const BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:8000")) + "/api/v1";

/** "mock" only when VITE_USE_MOCK=true. The UI shows a "Sample data" badge in that case. */
export const dataSource: "mock" | "live" = import.meta.env.VITE_USE_MOCK === "true" ? "mock" : "live";

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
    if (!res.ok) throw new ApiError("http", `HTTP ${res.status}`, res.status);
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

export const api = {
  route: async (body: RouteRequest, signal?: AbortSignal): Promise<RouteResponse> => {
    if (dataSource === "mock") {
      const { mockRoute } = await import("./mock.ts");
      return mockRoute(body, signal);
    }
    return parseRouteResponse(await request<unknown>("/route", { method: "POST", body: JSON.stringify(body) }, signal));
  },

  layers: async (signal?: AbortSignal): Promise<LayersResponse> => {
    if (dataSource === "mock") {
      const { mockLayers } = await import("./mock.ts");
      return mockLayers(signal);
    }
    return parseLayersResponse(await request<unknown>("/layers", undefined, signal));
  },
};
