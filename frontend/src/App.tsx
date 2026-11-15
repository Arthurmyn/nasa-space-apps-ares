import { Suspense, lazy, useEffect, useState } from "react";
import { Disclaimer } from "./components/ConditionsPanel.tsx";
import { ElevationProfile } from "./components/ElevationProfile.tsx";
import { LeftPanel, SideRail } from "./components/LeftPanel.tsx";
import { PanelToggle } from "./components/PanelToggle.tsx";
import { MobileSummary, RouteSummary } from "./components/RouteSummary.tsx";
import { StopCard } from "./components/StopCard.tsx";
import { StopsPanel } from "./components/StopsPanel.tsx";
import { TopBar, type Drawer, type Mode } from "./components/TopBar.tsx";
import { CardView } from "./modes/CardView.tsx";
import { HudView } from "./modes/HudView.tsx";
import { startMode } from "./lib/startMode.ts";
import { PlannerProvider, usePlanner } from "./state/PlannerContext.tsx";
import { SiteProvider, useSite } from "./state/SiteContext.tsx";
import { uiStore, useUi } from "./state/uiStore.ts";

// The map pulls in MapLibre (large), so it loads after the first paint.
const MapView = lazy(() => import("./map/MapView.tsx"));
const OverviewView = lazy(() => import("./modes/OverviewView.tsx"));

const MODES: readonly Mode[] = ["overview", "plan", "hud", "card"];

function MapFallback() {
  return (
    <div className="map-wrap map-wrap--loading" role="status">
      <span className="spinner" aria-hidden="true" /> Loading map
    </div>
  );
}

function PlanView({ drawer, onDrawer }: { drawer: Drawer; onDrawer: (d: Drawer) => void }) {
  const { state } = usePlanner();
  const ui = useUi();
  // The profile stays hidden until a route is being computed or exists, then slides in.
  const showProfile = Boolean(state.route) || state.status === "loading";
  const profile = showProfile ? "full" : "hidden";
  return (
    <div className="shell__body" data-drawer={drawer ?? undefined} data-profile={profile}
      data-left={ui.leftPanel ? undefined : "collapsed"}
      data-right={ui.rightCollapsed ? "collapsed" : undefined}
    >
      <SideRail />
      <aside id="layers-drawer" className="shell__left" aria-label="Layers, sites and site conditions">
        <LeftPanel
          onClose={() => {
            uiStore.showSidePanel(null);
            onDrawer(null);
          }}
        />
      </aside>
      <main className="shell__map">
        <Suspense fallback={<MapFallback />}>
          <MapView />
        </Suspense>
        <PanelToggle />
      </main>
      <aside id="route-drawer" className="shell__right" aria-label="Route details">
        <RouteSummary />
        <StopsPanel />
        <StopCard />
        <Disclaimer />
      </aside>
      <MobileSummary onOpen={() => onDrawer("route")} />
      {showProfile && (
        <div className="shell__profile">
          <ElevationProfile />
        </div>
      )}
      {drawer && <button type="button" className="shell__backdrop" aria-label="Close panel" onClick={() => onDrawer(null)} />}
    </div>
  );
}

/** Opening an ARES site from the overview: load its grid (if it is not the open one), then go to the planner. */
function OverviewRoute({ resetSignal, onPlan }: { resetSignal: number; onPlan: () => void }) {
  const { site, switchSite } = useSite();
  return (
    <Suspense fallback={<MapFallback />}>
      <OverviewView
        resetSignal={resetSignal}
        onOpenSite={(id) => {
          if (id !== site.id) switchSite(id);
          onPlan();
        }}
      />
    </Suspense>
  );
}

export default function App() {
  // The mode lives above SiteProvider: switching site remounts everything below it.
  const [mode, setMode] = useState<Mode>(() => startMode(window.location.search, window.location.hash));
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [overviewReset, setOverviewReset] = useState(0);
  const chooseMode = (next: Mode) => {
    // Pressing "Mars overview" on the overview brings the whole planet back.
    if (next === "overview" && mode === "overview") setOverviewReset((n) => n + 1);
    setDrawer(null);
    setMode(next);
  };

  // Escape closes an open drawer on small screens.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <SiteProvider>
    <PlannerProvider>
      <div className="shell">
        <TopBar mode={mode} modes={MODES} onMode={chooseMode} drawer={drawer} onDrawer={setDrawer} />
        {mode === "overview" && <OverviewRoute resetSignal={overviewReset} onPlan={() => setMode("plan")} />}
        {mode === "plan" && <PlanView drawer={drawer} onDrawer={setDrawer} />}
        {mode === "hud" && <HudView onBackToPlan={() => setMode("plan")} />}
        {mode === "card" && <CardView onBackToPlan={() => setMode("plan")} />}
      </div>
    </PlannerProvider>
    </SiteProvider>
  );
}
