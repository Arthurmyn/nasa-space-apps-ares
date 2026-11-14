import type { SafetyLevel } from "../api/types.ts";
import { SAFETY_LABEL } from "../lib/slope.ts";
import { Icon, type IconName } from "./Icon.tsx";

export const LEVEL_ICON: Record<SafetyLevel, IconName> = {
  ok: "check",
  caution: "alert",
  avoid: "octagon",
};

interface SafetyBadgeProps {
  level: SafetyLevel;
  /** Defaults to the standard label for the level. */
  label?: string;
}

/** Status is always icon + text + colour, never colour alone. */
export function SafetyBadge({ level, label = SAFETY_LABEL[level] }: SafetyBadgeProps) {
  return (
    <span className={`badge badge--${level}`}>
      <Icon name={LEVEL_ICON[level]} />
      <span>{label}</span>
    </span>
  );
}
