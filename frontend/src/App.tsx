import { Suspense, lazy, useEffect, useState } from "react";
import { ElevationProfile } from "./components/ElevationProfile.tsx";
import { LayersPanel } from "./components/LayersPanel.tsx";
import { MobileSummary, RouteSummary } from "./components/RouteSummary.tsx";
import { StopCard } from "./components/StopCard.tsx";
import { StopsPanel } from "./components/StopsPanel.tsx";
import { TopBar, type Drawer, type Mode } from "./components/TopBar.tsx";
import { PlannerProvider } from "./state/PlannerContext.tsx";

// The map pulls in MapLibre (large), so it loads after the first paint.
const MapView = lazy(() => import("./map/MapView.tsx"));

const MODES: readonly Mode[] = ["plan"];

function MapFallback() {
  return (
    <div className="map-wrap map-wrap--loading" role="status">
      <span className="spinner" aria-hidden="true" /> Loading map
    </div>
  );
}

function PlanView({ drawer, onDrawer }: { drawer: Drawer; onDrawer: (d: Drawer) => void }) {
  return (
    <div className="shell__body" data-drawer={drawer ?? undefined}>
      <aside id="layers-drawer" className="shell__left" aria-label="Layers">
        <LayersPanel />
      </aside>
      <main className="shell__map">
        <Suspense fallback={<MapFallback />}>
          <MapView />
        </Suspense>
      </main>
      <aside id="route-drawer" className="shell__right" aria-label="Route details">
        <RouteSummary />
        <StopsPanel />
        <StopCard />
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
    <PlannerProvider>
      <div className="shell">
        <TopBar mode={mode} modes={MODES} onMode={setMode} drawer={drawer} onDrawer={setDrawer} />
        {mode === "plan" && <PlanView drawer={drawer} onDrawer={setDrawer} />}
      </div>
    </PlannerProvider>
  );
}
