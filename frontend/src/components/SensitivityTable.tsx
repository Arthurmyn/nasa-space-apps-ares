import type { SensitivityResponse } from "../api/types.ts";
import { SLOPE_LIMITS } from "../config/route.ts";
import { formatDistance, formatDuration, formatSlope } from "../lib/format.ts";
import type { SensitivityState } from "../state/useSensitivity.ts";
import { Icon } from "./Icon.tsx";

function Rows({ data }: { data: SensitivityResponse }) {
  return (
    <table className="table sensitivity-table">
      <caption className="sr-only">The same stops planned with a hard slope limit of 10, 15 and 20 degrees</caption>
      <thead>
        <tr>
          <th scope="col">Limit</th>
          <th scope="col">Length</th>
          <th scope="col">Time</th>
          <th scope="col">Max slope</th>
        </tr>
      </thead>
      <tbody>
        {data.results.map((r) => (
          <tr key={r.limit_deg} className={r.limit_deg === SLOPE_LIMITS.maxDeg ? "sensitivity-table__current" : undefined}>
            <th scope="row">
              {r.limit_deg}°
              {r.limit_deg === SLOPE_LIMITS.maxDeg && <span className="tag">Route limit</span>}
            </th>
            {r.reachable ? (
              <>
                <td className="mono">{r.distance_m === null ? "–" : formatDistance(r.distance_m)}</td>
                <td className="mono">{r.est_time_s === null ? "–" : formatDuration(r.est_time_s)}</td>
                <td className="mono">{r.max_slope_deg === null ? "–" : formatSlope(r.max_slope_deg)}</td>
              </>
            ) : (
              <td colSpan={3} className="sensitivity-table__fail">
                <Icon name="octagon" size={12} /> No route. {r.reason ?? ""}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** What a stricter or looser hard slope limit does to this plan: length, time and steepest slope, or why it fails. */
export function SensitivityTable({ state }: { state: SensitivityState }) {
  if (state.status === "loading") {
    return (
      <p className="progress-text" role="status">
        <span className="spinner" aria-hidden="true" /> Planning at 10°, 15° and 20°
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className="notice notice--error" role="alert">
        <Icon name="alert" /> <span>{state.message}</span>
      </p>
    );
  }
  if (state.status === "idle") return <p className="muted">Place a start and a stop to compare slope limits.</p>;
  return (
    <>
      <Rows data={state.data} />
      <p className="muted">
        Each row plans the same stops with that hard limit. 20° is tried here as an analysis; real routes stop at {SLOPE_LIMITS.maxDeg}°, the limit of the site data.
      </p>
    </>
  );
}
