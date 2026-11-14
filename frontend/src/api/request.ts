import { REQUEST_TIMEOUT_MS } from "../config/route.ts";
import { apiConnection } from "./connection.ts";
import { ApiError } from "./types.ts";

/** The parser validates the endpoint contract before the request is considered successful. */
export async function requestJson<T>(
  url: string, init?: RequestInit, signal?: AbortSignal,
  parse: (raw: unknown) => T = (raw) => raw as T,
): Promise<T> {
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
    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      if (res.ok) throw new ApiError("invalid", "Response was not valid JSON");
      // HTTP errors with non-JSON bodies still report their status.
    }
    timeout.signal.throwIfAborted();
    if (!res.ok) {
      const detail = res.status === 422 && typeof raw === "object" && raw !== null &&
        "detail" in raw && typeof raw.detail === "string" ? raw.detail.trim() || null : null;
      throw new ApiError("http", `HTTP ${res.status}`, res.status, detail);
    }
    const result = parse(raw);
    apiConnection.set("online");
    return result;
  } catch (e) {
    // Cancellation takes precedence, including failures while decoding a response body.
    if (signal?.aborted) throw new ApiError("aborted", "Request cancelled");
    if (timeout.signal.aborted) {
      apiConnection.set("timeout");
      throw new ApiError("timeout", "Request timed out");
    }
    if (e instanceof ApiError) {
      apiConnection.set(e.kind === "http" ? (e.status !== null && e.status >= 500 ? "service-error" : "online") : "invalid");
      throw e;
    }
    apiConnection.set("offline");
    throw new ApiError("network", "Network error");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}
