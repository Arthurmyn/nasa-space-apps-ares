import { useEffect, useState } from "react";
import { api } from "../api/client.ts";
import type { ValidationResponse } from "../api/types.ts";

/** The traverse check of a site: null while it loads, then the answer (a failure is "not available", never an error). */
export function useValidation(siteId: string): ValidationResponse | null {
  const [answer, setAnswer] = useState<ValidationResponse | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    setAnswer(null);
    api
      .validation(siteId, ctrl.signal)
      .then((v) => !ctrl.signal.aborted && setAnswer(v))
      .catch(() => undefined); // aborted: the next site has its own request
    return () => ctrl.abort();
  }, [siteId]);
  return answer;
}
