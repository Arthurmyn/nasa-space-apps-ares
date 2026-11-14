import { uiStore, useUi } from "../state/uiStore.ts";
import { Icon } from "./Icon.tsx";

/** Folds a side panel away (and back) on desktop; the map takes the freed width. */
export function PanelToggle({ side }: { side: "left" | "right" }) {
  const ui = useUi();
  const collapsed = side === "left" ? ui.leftCollapsed : ui.rightCollapsed;
  const label = `${collapsed ? "Show" : "Hide"} ${side === "left" ? "layers and sites" : "route details"} panel`;
  return (
    <button
      type="button"
      className={`panel-toggle panel-toggle--${side}`}
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      onClick={() => uiStore.togglePanel(side)}
    >
      {/* The chevron points the way the panel will move: away when open, back when folded. */}
      <Icon name="chevron" className={`panel-toggle__icon panel-toggle__icon--${collapsed === (side === "left") ? "right" : "left"}`} />
    </button>
  );
}
