import type { ValidationResponse } from "../api/types.ts";

const MINUS = "−";

/** A length in metres with a real minus sign and 2 decimals: "−4.66 m", "2.74 m". */
export function metres(v: number): string {
  if (!Number.isFinite(v)) return "–";
  const r = Math.round(v * 100) / 100;
  return `${r < 0 ? MINUS : ""}${Math.abs(r).toFixed(2)} m`;
}

export interface ValidationRow {
  label: string;
  mean: string;
  rmse: string;
  max: string;
}

export type ValidationView =
  | { kind: "figures"; n: number; rows: ValidationRow[]; offset: string; sourceUrl: string; fetched: string }
  | { kind: "not-computed"; reason: string }
  | { kind: "unavailable"; reason: string };

/**
 * What the Validation section shows. Every number is the file's own; a result that could not be made
 * (too few points, heights that do not match) shows its reason, and no answer shows "not available".
 */
export function validationView(v: ValidationResponse | null): ValidationView {
  if (!v) return { kind: "unavailable", reason: "Loading" };
  if (!v.available) return { kind: "unavailable", reason: v.reason };
  if (v.status !== "ok" || !v.raw || !v.offset_corrected) return { kind: "not-computed", reason: v.reason ?? "The comparison could not be made." };
  const row = (label: string, s: { mean_m: number; rmse_m: number; max_abs_m: number }): ValidationRow => ({ label, mean: metres(s.mean_m), rmse: metres(s.rmse_m), max: metres(s.max_abs_m) });
  return {
    kind: "figures",
    n: v.n_points,
    rows: [row("Raw difference", v.raw), row("After removing the offset", v.offset_corrected)],
    offset: metres(v.offset_corrected.offset_m),
    sourceUrl: v.source.url,
    fetched: v.source.fetched_utc.slice(0, 10),
  };
}
