import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { BottomSheet } from "./components/BottomSheet.tsx";
import { Disclaimer } from "./components/ConditionsPanel.tsx";
import { ElevationProfile } from "./components/ElevationProfile.tsx";
import { LeftPanel, SideRail } from "./components/LeftPanel.tsx";
import { PanelToggle } from "./components/PanelToggle.tsx";
import { MobileSummary, RouteSummary, SheetSummary } from "./components/RouteSummary.tsx";
import { StopCard } from "./components/StopCard.tsx";
import { StopsPanel } from "./components/StopsPanel.tsx";
import { TopBar, type Drawer, type Mode } from "./components/TopBar.tsx";
import { CardView } from "./modes/CardView.tsx";
import { HudView } from "./modes/HudView.tsx";
import { startMode } from "./lib/startMode.ts";
import { useMediaQuery, MOBILE_QUERY } from "./lib/useMediaQuery.ts";
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

/** Phones: a full-screen map with the planner as a bottom sheet. The layers drawer stays a drawer. */
function PhonePlanView({ drawer, onDrawer }: { drawer: Drawer; onDrawer: (d: Drawer) => void }) {
  const { state } = usePlanner();
  const ui = useUi();
  const hasRoute = Boolean(state.route);

  // The first route that arrives lifts the sheet to half height, so the result is readable without a tap.
  const hadRoute = useRef(hasRoute);
  useEffect(() => {
    if (hasRoute && !hadRoute.current && uiStore.get().sheetSnap === "peek") uiStore.setSheetSnap("half");
    hadRoute.current = hasRoute;
  }, [hasRoute]);

  // "Method" in the route summary opens the left drawer on its Method tab.
  useEffect(() => {
    if (ui.leftPanel === "method" && drawer === null) onDrawer("layers");
  }, [ui.leftPanel]);

  const closeDrawer = () => {
    uiStore.showSidePanel(null);
    onDrawer(null);
  };
  return (
    <div className="shell__body shell__body--phone" data-drawer={drawer ?? undefined} data-left-panel={ui.leftPanel ?? undefined}>
      <aside id="layers-drawer" className="shell__left" aria-label="Layers, sites and site conditions">
        <LeftPanel onClose={closeDrawer} />
      </aside>
      <main className="shell__map">
        <Suspense fallback={<MapFallback />}>
          <MapView />
        </Suspense>
      </main>
      <BottomSheet summary={<SheetSummary />}>
        <RouteSummary />
        {hasRoute && (
          <div className="sheet__profile">
            <ElevationProfile />
          </div>
        )}
        <StopsPanel />
        <StopCard />
        <Disclaimer />
      </BottomSheet>
      {drawer && <button type="button" className="shell__backdrop" aria-label="Close panel" onClick={closeDrawer} />}
    </div>
  );
}

function PlanView({ drawer, onDrawer }: { drawer: Drawer; onDrawer: (d: Drawer) => void }) {
  const phone = useMediaQuery(MOBILE_QUERY);
  return phone ? <PhonePlanView drawer={drawer} onDrawer={onDrawer} /> : <TabletDesktopPlanView drawer={drawer} onDrawer={onDrawer} />;
}

function TabletDesktopPlanView({ drawer, onDrawer }: { drawer: Drawer; onDrawer: (d: Drawer) => void }) {
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
