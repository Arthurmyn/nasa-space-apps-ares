import type { RouteStatusCode } from "../api/types.ts";
import { STATUS_TONE } from "../lib/routeInsight.ts";
import { Icon } from "./Icon.tsx";
import { LEVEL_ICON } from "./SafetyBadge.tsx";

/** GO, CAUTION or NO-GO: icon, text and colour together, never colour alone. */
export function StatusBadge({ status }: { status: RouteStatusCode }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={`badge badge--${tone} status-badge`}>
      <Icon name={LEVEL_ICON[tone]} />
      <span>{status}</span>
    </span>
  );
}

/** The mission status of the route with the plain sentences behind it. */
export function RouteStatus({ status, reasons, fallback }: { status: RouteStatusCode; reasons: readonly string[]; fallback: boolean }) {
  return (
    <div className="mission-status">
      <span className="stat__label">Mission status</span>
      <StatusBadge status={status} />
      {reasons.length > 0 && (
        <ul className="mission-status__reasons">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {fallback && (
        <p className="tag tag--warn">
          <Icon name="alert" size={12} /> Safe profile fell back to the route limit
        </p>
      )}
    </div>
  );
}
