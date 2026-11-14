import { Suspense, lazy, useEffect, useState } from "react";
import { ConditionsPanel, Disclaimer } from "./components/ConditionsPanel.tsx";
import { ElevationProfile } from "./components/ElevationProfile.tsx";
import { LeftPanel } from "./components/LeftPanel.tsx";
import { PanelToggle } from "./components/PanelToggle.tsx";
import { MobileSummary, RouteSummary } from "./components/RouteSummary.tsx";
import { SiteContextNote } from "./components/SiteContextNote.tsx";
import { StopCard } from "./components/StopCard.tsx";
import { StopsPanel } from "./components/StopsPanel.tsx";
import { TopBar, type Drawer, type Mode } from "./components/TopBar.tsx";
import { CardView } from "./modes/CardView.tsx";
import { HudView } from "./modes/HudView.tsx";
import { PlannerProvider, usePlanner } from "./state/PlannerContext.tsx";
import { SiteProvider } from "./state/SiteContext.tsx";
import { useUi } from "./state/uiStore.ts";

// The map pulls in MapLibre (large), so it loads after the first paint.
const MapView = lazy(() => import("./map/MapView.tsx"));

const MODES: readonly Mode[] = ["plan", "hud", "card"];

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
  // Without a route the profile only holds a hint, so it takes a thin strip instead of a quarter of the screen.
  const profile = state.route || state.status === "loading" ? "full" : "empty";
  return (
    <div className="shell__body" data-drawer={drawer ?? undefined} data-profile={profile}
      data-left={ui.leftCollapsed ? "collapsed" : undefined}
      data-right={ui.rightCollapsed ? "collapsed" : undefined}
    >
      <aside id="layers-drawer" className="shell__left" aria-label="Layers">
        <LeftPanel />
      </aside>
      <main className="shell__map">
        <Suspense fallback={<MapFallback />}>
          <MapView />
        </Suspense>
        <PanelToggle side="left" />
        <PanelToggle side="right" />
      </main>
      <aside id="route-drawer" className="shell__right" aria-label="Route details">
        <RouteSummary />
        <StopsPanel />
        <StopCard />
        <SiteContextNote />
        <ConditionsPanel />
        <Disclaimer />
      </aside>
      <MobileSummary onOpen={() => onDrawer("route")} />
      <div className="shell__profile">
        <ElevationProfile />
      </div>
      {drawer && <button type="button" className="shell__backdrop" aria-label="Close panel" onClick={() => onDrawer(null)} />}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("plan");
  const [drawer, setDrawer] = useState<Drawer>(null);

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
        <TopBar mode={mode} modes={MODES} onMode={setMode} drawer={drawer} onDrawer={setDrawer} />
        {mode === "plan" && <PlanView drawer={drawer} onDrawer={setDrawer} />}
        {mode === "hud" && <HudView onBackToPlan={() => setMode("plan")} />}
        {mode === "card" && <CardView onBackToPlan={() => setMode("plan")} />}
      </div>
    </PlannerProvider>
    </SiteProvider>
  );
}
