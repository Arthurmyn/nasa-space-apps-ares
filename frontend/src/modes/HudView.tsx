import { Suspense, lazy, useCallback, useState } from "react";
import { Icon } from "../components/Icon.tsx";
import { webglAvailable } from "../hud3d/TerrainScene.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
import { HudView2D } from "./HudView2D.tsx";

// three.js is large; it loads only when the HUD is opened.
const Hud3D = lazy(() => import("../hud3d/Hud3D.tsx"));

/**
 * The HUD tab: a 3D terrain view with the route, or the 2D HUD when WebGL or the terrain files are
 * not available. The position along the route is simulated; there is no live position feed.
 */
export function HudView({ onBackToPlan }: { onBackToPlan: () => void }) {
  const { state, stale } = usePlanner();
  const route = state.route;
  const [failed, setFailed] = useState(() => !webglAvailable());
  const fail = useCallback(() => setFailed(true), []);

  if (!route) {
    return (
      <main className="card-screen">
        <div className="card-empty">
          <p className="empty__title">Build a route in Plan to use HUD</p>
          <p className="muted">The HUD shows heading, distance, slope, the next waypoint and hazards along a planned route.</p>
          <button type="button" className="btn btn--primary" onClick={onBackToPlan}>
            <Icon name="route" /> Back to Plan
          </button>
        </div>
      </main>
    );
  }
  if (failed) return <HudView2D onBackToPlan={onBackToPlan} />;

  return (
    <div className="hud3d-wrap">
      {stale && (
        <p className="hud3d__stale" role="note">
          <Icon name="alert" /> The route is out of date. Recalculate in Plan.
        </p>
      )}
      <Suspense
        fallback={
          <p className="hud3d__loading hud3d__loading--page" role="status">
            <span className="spinner" aria-hidden="true" /> Loading 3D view
          </p>
        }
      >
        <Hud3D route={route} onUnavailable={fail} />
      </Suspense>
    </div>
  );
}
