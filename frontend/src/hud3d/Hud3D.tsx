import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadTerrain, type Terrain } from "../api/terrain.ts";
import type { RouteResponse } from "../api/types.ts";
import { Icon } from "../components/Icon.tsx";
import { LEVEL_ICON } from "../components/SafetyBadge.tsx";
import { SLOPE_LIMITS } from "../config/route.ts";
import { computeScaleBar, ringCentroid } from "../lib/geo.ts";
import { formatDistance, formatSlope, stopLabel } from "../lib/format.ts";
import { computeHud, formatHeading, hazardLabel, nearestHazard } from "../lib/hud.ts";
import { profileExtent } from "../lib/profile.ts";
import { SLOPE_CLASS_LABEL } from "../lib/slope.ts";
import { useSite } from "../state/SiteContext.tsx";
import { TerrainScene, type OverlayItem } from "./TerrainScene.ts";

const EXAGGERATION = 2;
const STEP_M = 5;

const meters = (m: number) => `${Math.round(m)} m`;

function Compass({ heading }: { heading: number }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  return (
    <svg className="hud3d__compass" viewBox="0 0 100 100" role="img" aria-label={`Compass, heading ${Math.round(heading)} degrees`}>
      <circle cx="50" cy="50" r="46" className="hud3d__compass-ring" />
      <g transform={`rotate(${-heading} 50 50)`}>
        {ticks.map((a) => (
          <line key={a} x1="50" x2="50" y1="4" y2={a % 90 === 0 ? 12 : a % 30 === 0 ? 10 : 8} transform={`rotate(${a} 50 50)`} className="hud3d__compass-tick" />
        ))}
        <text x="50" y="22" textAnchor="middle" className="hud3d__compass-n">N</text>
      </g>
      <path d="M50 28L58 62L50 55L42 62Z" className="hud3d__compass-needle" />
    </svg>
  );
}

function Metric({ label, children, icon }: { label: string; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="hud3d__metric">
      <div className="hud3d__metric-icon" aria-hidden="true">{icon}</div>
      <div>
        <h2 className="hud3d__label">{label}</h2>
        {children}
      </div>
    </div>
  );
}

interface Props {
  route: RouteResponse;
  /** Called when the 3D view cannot run, so the caller can show the 2D HUD. */
  onUnavailable: () => void;
}

/** The 3D HUD: metrics, a terrain view with the route, the next waypoint, the nearest hazard and progress. */
export default function Hud3D({ route, onUnavailable }: Props) {
  const { site } = useSite();
  const total = useMemo(() => profileExtent(route.profile)?.totalDist ?? 0, [route]);
  const first = route.profile[0]?.dist_m ?? 0;
  const [posDistM, setPosDistM] = useState(first);
  const hud = useMemo(() => computeHud(route, posDistM, SLOPE_LIMITS), [route, posDistM]);
  const hazard = useMemo(() => (hud ? nearestHazard(route, hud.position) : null), [route, hud]);

  useEffect(() => {
    setPosDistM((p) => Math.min(Math.max(p, first), first + total));
  }, [first, total]);

  // ---- the 3D scene
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TerrainScene | null>(null);
  const pins = useRef(new Map<string, HTMLElement>());
  const scaleBarRef = useRef<HTMLDivElement>(null);
  const scaleTextRef = useRef<HTMLSpanElement>(null);
  const [terrain, setTerrain] = useState<Terrain | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const setPin = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) pins.current.set(id, el);
    else pins.current.delete(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadTerrain(site.id)
      .then((t) => !cancelled && setTerrain(t))
      .catch((e: unknown) => {
        console.warn("3D terrain unavailable", e);
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [site.id]);

  /** Centre of every zone, to place the one label that follows the nearest zone. */
  const zoneCentres = useMemo(() => {
    const map = new Map<string, readonly [number, number]>();
    for (const z of route.hazards) {
      const ring = z.polygon.coordinates[0];
      const c = ring ? ringCentroid(ring) : null;
      if (c) map.set(z.id, c);
    }
    return map;
  }, [route]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!terrain || !mount) return;
    let scene: TerrainScene;
    try {
      const small = window.matchMedia("(max-width: 700px)").matches;
      scene = new TerrainScene({
        container: mount,
        terrain,
        route,
        exaggeration: EXAGGERATION,
        maxVertices: small ? 14000 : 36000,
        onScale: (mpp) => {
          const bar = computeScaleBar(mpp, 120);
          if (!bar || !scaleBarRef.current || !scaleTextRef.current) return;
          scaleBarRef.current.style.width = `${bar.widthPx}px`;
          scaleTextRef.current.textContent = `0 / ${bar.metres / 2} / ${bar.label}`;
        },
      });
    } catch (e) {
      console.warn("3D scene could not start", e);
      onUnavailable();
      return;
    }
    sceneRef.current = scene;
    const items: OverlayItem[] = [];
    for (const [id, el] of pins.current) {
      if (id === "pos" || id === "hz") continue;
      const [lon, lat] = (el.dataset.at ?? "").split(",").map(Number) as [number, number];
      items.push({ id, el, lon, lat });
    }
    const hzEl = pins.current.get("hz");
    const firstZone = zoneCentres.values().next().value;
    if (hzEl && firstZone) items.push({ id: "hz", el: hzEl, lon: firstZone[0], lat: firstZone[1] });
    const posEl = pins.current.get("pos");
    const start = route.polyline[0];
    if (posEl && start) items.push({ id: "pos", el: posEl, lon: start[0], lat: start[1] });
    scene.setOverlay(items);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // The scene is rebuilt for a new terrain or route only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, route]);

  useEffect(() => {
    if (hud) sceneRef.current?.moveOverlay("pos", hud.position[0], hud.position[1]);
  }, [hud]);

  // The label sits on the zone that is nearest to the current position.
  const hazardId = hazard?.id;
  useEffect(() => {
    const c = hazardId ? zoneCentres.get(hazardId) : undefined;
    if (c) sceneRef.current?.moveOverlay("hz", c[0], c[1]);
  }, [hazardId, zoneCentres, terrain]);

  useEffect(() => {
    if (loadFailed) onUnavailable();
  }, [loadFailed, onUnavailable]);

  // ---- keyboard: arrows move the simulated position along the route
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const step = STEP_M * (e.shiftKey ? 5 : 1);
      setPosDistM((p) => Math.min(first + total, Math.max(first, p + dir * step)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [first, total]);

  if (!hud) return null;
  const progressed = Math.min(total, Math.max(0, posDistM - first));
  const percent = total > 0 ? (progressed / total) * 100 : 0;
  const lastIndex = route.stops.length - 1;
  const heading = hud.headingDeg;

  return (
    <main className="hud3d" aria-label="Heads-up display">
      <section className="hud3d__panel hud3d__metrics" aria-label="Route metrics">
        <Metric label="Heading" icon={<Compass heading={heading} />}>
          <p className="hud3d__value mono">{formatHeading(heading)}</p>
        </Metric>
        <Metric label="Distance to destination" icon={<Icon name="route" size={34} />}>
          <p className="hud3d__value mono">{formatDistance(hud.destDistM)}</p>
        </Metric>
        <Metric
          label="Slope"
          icon={
            <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true">
              <path d="M3 25 L37 25 L37 6 Z" className="hud3d__triangle" />
            </svg>
          }
        >
          <div className="hud3d__slope">
            <p className="hud3d__value mono">{formatSlope(hud.slopeDeg)}</p>
            <p className={`hud3d__status hud3d__status--${hud.slopeClass}`}>
              <Icon name={LEVEL_ICON[hud.slopeClass]} /> {SLOPE_CLASS_LABEL[hud.slopeClass]}
            </p>
          </div>
        </Metric>
      </section>

      <section className="hud3d__panel hud3d__map" aria-label="3D terrain with the route">
        <div ref={mountRef} className="hud3d__scene" role="img" aria-label="3D terrain of the site with the planned route. Drag to rotate, scroll or pinch to zoom." />
        {!terrain && !loadFailed && (
          <p className="hud3d__loading" role="status">
            <span className="spinner" aria-hidden="true" /> Loading terrain
          </p>
        )}

        <div className="hud3d__overlay" aria-hidden="true">
          {route.stops.map((s, i) => (
            <div key={s.id} ref={setPin(`stop-${i}`)} data-at={`${s.lon},${s.lat}`} className="hud3d__pin">
              <span className={i === lastIndex ? "hud3d__dot hud3d__dot--target" : "hud3d__dot"} />
              <span className="hud3d__pill">
                {i === lastIndex ? (
                  <>Destination</>
                ) : (
                  <>
                    <span className="hud3d__badge">{stopLabel(i)}</span> Stop {stopLabel(i)}
                  </>
                )}
              </span>
            </div>
          ))}
          {hazard && (
            <div ref={setPin("hz")} className="hud3d__pin hud3d__pin--hazard">
              <span className="hud3d__pill hud3d__pill--hazard">
                <Icon name="alert" size={13} /> {hazardLabel(hazard.label)}
              </span>
            </div>
          )}
          <div ref={setPin("pos")} className="hud3d__pin">
            <span className="hud3d__me" />
          </div>
        </div>

        <div className="hud3d__legend" role="group" aria-label="Route overview legend">
          <h2 className="hud3d__legend-title"><Icon name="layers" size={14} /> Route Overview</h2>
          <ul>
            <li><span className="hud3d__key hud3d__key--route" /> Planned route</li>
            <li><span className="hud3d__key hud3d__key--hazard" /> Hazard (steep slope)</li>
            <li><span className="hud3d__key hud3d__key--waypoint" /> Waypoint</li>
            <li><span className="hud3d__key hud3d__key--me" /> Current position</li>
            <li><span className="hud3d__key hud3d__key--target" /> Destination</li>
          </ul>
        </div>

        <div className="hud3d__zoom" role="group" aria-label="Map controls">
          <button type="button" className="hud3d__btn" aria-label="Zoom in" onClick={() => sceneRef.current?.zoom(0.8)}><Icon name="plus" /></button>
          <button type="button" className="hud3d__btn" aria-label="Zoom out" onClick={() => sceneRef.current?.zoom(1.25)}><Icon name="minus" /></button>
          <button type="button" className="hud3d__btn" aria-label="Centre on current position" onClick={() => sceneRef.current?.centreOn(hud.position[0], hud.position[1])}><Icon name="crosshair" /></button>
          <button type="button" className="hud3d__btn hud3d__btn--text" onClick={() => sceneRef.current?.resetView()}>Reset view</button>
        </div>

        <div className="hud3d__scale" aria-hidden="true">
          <span ref={scaleTextRef} className="mono">0</span>
          <div ref={scaleBarRef} className="hud3d__scale-bar" />
        </div>
        <p className="hud3d__caption">Vertical exaggeration x{EXAGGERATION}</p>
      </section>

      <div className="hud3d__cards">
        <section className="hud3d__panel hud3d__card" aria-label="Next waypoint">
          {hud.next ? (
            <>
              <span className="hud3d__badge hud3d__badge--lg" aria-hidden="true">{hud.next.label}</span>
              <div className="hud3d__card-text">
                <h2 className="hud3d__label">Next waypoint</h2>
                <p className="hud3d__card-title" title={hud.next.name}>{hud.next.name}</p>
              </div>
              <p className="hud3d__card-dist hud3d__card-dist--mint mono">{formatDistance(hud.next.distM)} <span>ahead</span></p>
            </>
          ) : (
            <>
              <Icon name="check" size={28} />
              <div className="hud3d__card-text">
                <h2 className="hud3d__label">Next waypoint</h2>
                <p className="hud3d__card-title">Destination reached</p>
              </div>
            </>
          )}
        </section>

        <section className="hud3d__panel hud3d__card" aria-label="Nearest hazard">
          {hazard ? (
            <>
              <Icon name="alert" size={30} className="hud3d__hazard-icon" />
              <div className="hud3d__card-text">
                <h2 className="hud3d__label">Nearest hazard</h2>
                <p className="hud3d__card-title">{hazardLabel(hazard.label)}</p>
              </div>
              <p className="hud3d__card-dist hud3d__card-dist--hazard mono">
                {hazard.distM < 1 ? <>inside</> : <>{formatDistance(hazard.distM)} <span>away</span></>}
              </p>
            </>
          ) : (
            <>
              <Icon name="check" size={28} className="hud3d__ok-icon" />
              <div className="hud3d__card-text">
                <h2 className="hud3d__label">Nearest hazard</h2>
                <p className="hud3d__card-title hud3d__ok">No hazard on route</p>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="hud3d__panel hud3d__progress" aria-label="Mission progress">
        <h2 className="hud3d__label">Mission progress</h2>
        <div className="hud3d__progress-control">
          <button type="button" className="hud3d__btn" aria-label={`Step back ${STEP_M} metres`} onClick={() => setPosDistM((p) => Math.max(first, p - STEP_M))}>
            <Icon name="chevron" className="hud3d__chev hud3d__chev--back" />
          </button>
          <input
            type="range"
            className="hud3d__range"
            style={{ ["--hud-progress" as string]: `${percent}%` }}
            min={first}
            max={first + total}
            step={1}
            value={posDistM}
            aria-label="Simulated position along the route"
            aria-valuetext={`${meters(progressed)} of ${meters(total)}`}
            onChange={(e) => setPosDistM(Number(e.target.value))}
          />
          <button type="button" className="hud3d__btn" aria-label={`Step forward ${STEP_M} metres`} onClick={() => setPosDistM((p) => Math.min(first + total, p + STEP_M))}>
            <Icon name="chevron" className="hud3d__chev hud3d__chev--fwd" />
          </button>
        </div>
        <p className="hud3d__progress-text mono">{meters(progressed)} / {meters(total)}</p>
      </section>
    </main>
  );
}
