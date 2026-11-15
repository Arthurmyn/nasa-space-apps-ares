import { dataSource } from "../api/client.ts";
import { formatUtcTime } from "../lib/format.ts";
import { DESKTOP_QUERY, useMediaQuery } from "../lib/useMediaQuery.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
import { useSite } from "../state/SiteContext.tsx";
import { uiStore, useUi } from "../state/uiStore.ts";
import { Icon } from "./Icon.tsx";
import { UtcClock } from "./UtcClock.tsx";

export type Mode = "plan" | "hud" | "card";

const MODE_LABEL: Record<Mode, string> = { plan: "Plan", hud: "HUD", card: "Card" };

export type Drawer = "layers" | "route" | null;

interface TopBarProps {
  mode: Mode;
  modes: readonly Mode[];
  onMode: (mode: Mode) => void;
  drawer: Drawer;
  onDrawer: (drawer: Drawer) => void;
}

/** Sample-data label, shown only in dev mock mode. */
function SampleDataBadge() {
  return (
    <span className="badge badge--caution topbar__data-badge" role="status" aria-label="Sample data" title="Sample data">
      <Icon name="info" />
      <span>Sample data</span>
    </span>
  );
}

function TestDataBadge() {
  return (
    <span className="badge badge--caution topbar__data-badge" aria-label="Test data" title="The terrain grid is generated for testing, not measured Mars data">
      <Icon name="alert" />
      <span>Test data</span>
    </span>
  );
}

export function TopBar({ mode, modes, onMode, drawer, onDrawer }: TopBarProps) {
  const { state } = usePlanner();
  const { site } = useSite();
  const computed = state.route ? formatUtcTime(state.route.computed_at) : null;
  const ui = useUi();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  // Wide screens fold the column away; narrow screens slide it over the map.
  const toggle = (side: "left" | "right") => {
    if (desktop) {
      uiStore.togglePanel(side);
      return;
    }
    const d = side === "left" ? "layers" : "route";
    onDrawer(drawer === d ? null : d);
  };
  const open = (side: "left" | "right") =>
    desktop ? !(side === "left" ? ui.leftCollapsed : ui.rightCollapsed) : drawer === (side === "left" ? "layers" : "route");

  return (
    <header className="topbar">
      <div className="topbar__left">
        {mode === "plan" && (
          <button
            type="button"
            className="btn btn--icon topbar__drawer-btn"
            aria-expanded={open("left")}
            aria-controls="layers-drawer"
            aria-label="Layers and sites"
            title="Layers and sites"
            onClick={() => toggle("left")}
          >
            <Icon name="menu" />
          </button>
        )}
        <h1 className="topbar__brand">ARES</h1>
        <span className="topbar__site">{site.name}</span>
      </div>

      <nav className="topbar__modes" aria-label="Mode">
        {modes.map((m) => (
          <button key={m} type="button" className="seg" aria-pressed={mode === m} onClick={() => onMode(m)}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </nav>

      <div className="topbar__right">
        {site.isTestData && <TestDataBadge />}
        {dataSource === "mock" && <SampleDataBadge />}
        {mode === "hud" ? <UtcClock /> : <span className="topbar__time mono">{computed ? `Computed ${computed}` : "No route computed"}</span>}
        {mode === "plan" && (
          <button
            type="button"
            className="btn btn--icon topbar__drawer-btn"
            aria-expanded={open("right")}
            aria-controls="route-drawer"
            aria-label="Route details"
            title="Route details"
            onClick={() => toggle("right")}
          >
            <Icon name="route" />
          </button>
        )}
      </div>
    </header>
  );
}
