import { useId } from "react";
import type { ReturnCheck as ReturnCheckData } from "../api/types.ts";
import { STOP_TIME_OPTIONS_MIN } from "../config/route.ts";
import { formatDistance, formatDuration } from "../lib/format.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
import { SafetyBadge } from "./SafetyBadge.tsx";

/** "1 h" for whole hours, else the usual duration. */
export function formatLimitDuration(seconds: number): string {
  return seconds > 0 && seconds % 3600 === 0 ? `${seconds / 3600}\u00a0h` : formatDuration(seconds);
}

/** "2.00 km · 1 h", either part may be missing. */
export function returnLimitText(check: Pick<ReturnCheckData, "limit_m" | "limit_s">): string {
  return [check.limit_m != null ? formatDistance(check.limit_m) : null, check.limit_s != null ? formatLimitDuration(check.limit_s) : null]
    .filter(Boolean)
    .join(" · ");
}

/** Planned minutes at each stop. Changing it asks for a new route, like moving a point. */
export function StopTimeField() {
  const p = usePlanner();
  const id = useId();
  const options = [...new Set<number>([...STOP_TIME_OPTIONS_MIN, p.state.stopTimeMin])].sort((a, b) => a - b);
  return (
    <div className="field return-check__field">
      <label htmlFor={id} className="field__label">
        Time at each stop (added to the EVA time)
      </label>
      <select id={id} className="select" value={p.state.stopTimeMin} onChange={(e) => p.setStopTime(Number(e.target.value))}>
        {options.map((m) => (
          <option key={m} value={m}>
            {m} min
          </option>
        ))}
      </select>
    </div>
  );
}

/** The longest walk back to the start from any route point, against the site's return limit. */
export function ReturnCheck({ check }: { check: ReturnCheckData | null | undefined }) {
  return (
    <div className="return-check">
      {check && (
        <>
          <div className="return-check__head">
            <span className="stat__label">Return to start</span>
            <SafetyBadge level={check.ok ? "ok" : "avoid"} label={check.ok ? "Within limit" : "Over limit"} />
          </div>
          <p className="return-check__value mono">
            {formatDistance(check.worst_return_m)} · {formatDuration(check.worst_return_s)}
            <span className="return-check__limit"> of {returnLimitText(check)}</span>
          </p>
          <p className="return-check__note">
            Longest walk back, from the point {formatDistance(check.worst_route_dist_m)} along the route. Checked from every route
            point along the shortest walkable way, same slope limit.
          </p>
        </>
      )}
      <StopTimeField />
    </div>
  );
}
