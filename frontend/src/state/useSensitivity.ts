import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.ts";
import { describeError } from "../api/errors.ts";
import type { RouteRequest, SensitivityResponse } from "../api/types.ts";

export type SensitivityState = { status: "idle" } | { status: "loading" } | { status: "ready"; data: SensitivityResponse } | { status: "error"; message: string };

/**
 * The slope-limit analysis of the current plan. It asks only while `enabled` (the drawer is open)
 * and the request is current, and asks again when the request changes. A request in flight is
 * cancelled when the plan moves on.
 */
export function useSensitivity(request: RouteRequest | null, enabled: boolean): SensitivityState {
  const [state, setState] = useState<SensitivityState>({ status: "idle" });
  const key = useMemo(() => (request ? JSON.stringify(request) : null), [request]);

  useEffect(() => {
    if (!enabled || !key) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading" });
    api
      .sensitivity(JSON.parse(key) as RouteRequest, ctrl.signal)
      .then((data) => {
        if (!ctrl.signal.aborted) setState({ status: "ready", data });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        console.warn("Sensitivity request failed", e);
        setState({ status: "error", message: describeError(e, () => null) });
      });
    return () => ctrl.abort();
  }, [enabled, key]);

  return state;
}
