import type { Readiness, ReadinessLevel } from "../api/types.ts";
import { READINESS_LABEL, READINESS_TONE } from "../lib/routeInsight.ts";
import { Icon } from "./Icon.tsx";
import { LEVEL_ICON } from "./SafetyBadge.tsx";

/** NOMINAL, MARGINAL or NOT ADVISED: icon, text and colour together, never colour alone. */
export function ReadinessBadge({ level }: { level: ReadinessLevel }) {
  const tone = READINESS_TONE[level];
  return (
    <span className={`badge badge--${tone} status-badge`}>
      <Icon name={LEVEL_ICON[tone]} />
      <span>{READINESS_LABEL[level]}</span>
    </span>
  );
}

/** How ready the route is for an EVA, with the plain sentences behind it. */
export function EvaReadiness({ readiness, fallback }: { readiness: Readiness; fallback: boolean }) {
  return (
    <div className="mission-status">
      <span className="stat__label">EVA readiness</span>
      <ReadinessBadge level={readiness.level} />
      {readiness.reasons.length > 0 && (
        <ul className="mission-status__reasons">
          {readiness.reasons.map((r) => (
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
