import { REQUEST_TIMEOUT_MS } from "../config/route.ts";
import { apiConnection } from "./connection.ts";
import { ApiError } from "./types.ts";

export async function requestJson<T>(url: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const onCallerAbort = () => timeout.abort();
  signal?.addEventListener("abort", onCallerAbort);
  if (signal?.aborted) onCallerAbort();

  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...init,
      signal: timeout.signal,
    });
    if (!signal?.aborted) apiConnection.set(res.status >= 500 ? "offline" : "online");
    if (!res.ok) {
      let detail: string | null = null;
      if (res.status === 422) {
        try {
          const body: unknown = await res.json();
          if (typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string") {
            detail = body.detail.trim() || null;
          }
        } catch { /* Non-JSON errors use the standard message. */ }
      }
      throw new ApiError("http", `HTTP ${res.status}`, res.status, detail);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError("invalid", "Response was not valid JSON");
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (signal?.aborted) throw new ApiError("aborted", "Request cancelled");
    apiConnection.set("offline");
    if (timeout.signal.aborted) throw new ApiError("timeout", "Request timed out");
    throw new ApiError("network", "Network error");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}
