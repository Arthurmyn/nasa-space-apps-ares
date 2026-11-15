import { dataSource } from "../api/client.ts";
import { formatUtcTime } from "../lib/format.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
import { useSite } from "../state/SiteContext.tsx";
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
  const toggle = (d: Exclude<Drawer, null>) => onDrawer(drawer === d ? null : d);

  return (
    <header className="topbar">
      <div className="topbar__left">
        {mode === "plan" && (
          <button
            type="button"
            className="btn btn--icon topbar__drawer-btn"
            aria-expanded={drawer === "layers"}
            aria-controls="layers-drawer"
            aria-label="Layers"
            onClick={() => toggle("layers")}
          >
            <Icon name="layers" />
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
            aria-expanded={drawer === "route"}
            aria-controls="route-drawer"
            aria-label="Route"
            onClick={() => toggle("route")}
          >
            <Icon name="route" />
          </button>
        )}
      </div>
    </header>
  );
}
