import { useEffect, useState } from "react";
import { api } from "../api/client.ts";
import type { ConditionsData } from "../api/types.ts";

/** "loading" until the answer; then the reading, or "unavailable" for any failure (the card then hides). */
export type ConditionsState = { status: "loading" } | { status: "ready"; data: ConditionsData } | { status: "unavailable"; reason: string };

export function useConditions(): ConditionsState {
  const [state, setState] = useState<ConditionsState>({ status: "loading" });
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .conditions(ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setState(res.available ? { status: "ready", data: res } : { status: "unavailable", reason: res.reason });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        console.warn("Conditions unavailable", e);
        setState({ status: "unavailable", reason: "The conditions service could not be reached" });
      });
    return () => ctrl.abort();
  }, []);
  return state;
}
