import { uiStore, useUi } from "../state/uiStore.ts";
import { Icon } from "./Icon.tsx";

/** Folds the route column away (and back) on desktop; the map takes the freed width. */
export function PanelToggle() {
  const collapsed = useUi().rightCollapsed;
  const label = `${collapsed ? "Show" : "Hide"} route details panel`;
  return (
    <button
      type="button"
      className="panel-toggle panel-toggle--right"
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      onClick={() => uiStore.toggleRight()}
    >
      {/* The chevron points the way the panel will move: away when open, back when folded. */}
      <Icon name="chevron" className={`panel-toggle__icon panel-toggle__icon--${collapsed ? "left" : "right"}`} />
    </button>
  );
}
