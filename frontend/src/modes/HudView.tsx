import { useEffect, useMemo, useState } from "react";
import type { RouteResponse } from "../api/types.ts";
import { Icon } from "../components/Icon.tsx";
import { LEVEL_ICON } from "../components/SafetyBadge.tsx";
import { HUD_RANGE_M, SLOPE_LIMITS } from "../config/route.ts";
import { formatDistance, formatSlope } from "../lib/format.ts";
import { computeHud, normalizeDeg, relativeBearing, toHeadingFrame, type HudModel } from "../lib/hud.ts";
import { profileExtent } from "../lib/profile.ts";
import { SLOPE_CLASS_LABEL } from "../lib/slope.ts";
import { usePlanner } from "../state/PlannerContext.tsx";

const COMPASS_W = 600;
const COMPASS_SPAN_DEG = 180;
const PX_PER_DEG = COMPASS_W / COMPASS_SPAN_DEG;
const CARDINAL: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };

function describeBearing(rel: number): string {
  const abs = Math.round(Math.abs(rel));
  if (abs < 5) return "ahead";
  return `${abs}° ${rel < 0 ? "left" : "right"}`;
}

function CompassBar({ hud }: { hud: HudModel }) {
  const { headingDeg } = hud;
  const first = Math.ceil((headingDeg - COMPASS_SPAN_DEG / 2) / 5) * 5;
  const ticks: number[] = [];
  for (let a = first; a <= headingDeg + COMPASS_SPAN_DEG / 2; a += 5) ticks.push(a);

  const place = (bearingDeg: number) => {
    const rel = relativeBearing(bearingDeg, headingDeg);
    const clamped = Math.max(-COMPASS_SPAN_DEG / 2, Math.min(COMPASS_SPAN_DEG / 2, rel));
    return { x: COMPASS_W / 2 + clamped * PX_PER_DEG, off: Math.abs(rel) > COMPASS_SPAN_DEG / 2, side: rel < 0 ? -1 : 1 };
  };

  return (
    <svg className="hud__compass" viewBox={`0 0 ${COMPASS_W} 70`} role="img" aria-label={`Compass bar, heading ${Math.round(headingDeg)} degrees`}>
      <path d="M0 24.5H600" className="hud__axis" />
      {ticks.map((a) => {
        const n = normalizeDeg(a);
        const x = COMPASS_W / 2 + (a - headingDeg) * PX_PER_DEG;
        const major = n % 30 === 0;
        const label = CARDINAL[n] ?? (major ? String(n).padStart(3, "0") : null);
        return (
          <g key={a}>
            <line x1={x} x2={x} y1={24} y2={major ? 14 : n % 10 === 0 ? 18 : 21} className="hud__tick" />
            {label && (
              <text x={x} y={9} textAnchor="middle" className={CARDINAL[n] ? "hud__cardinal" : "hud__degree"}>
                {label}
              </text>
            )}
          </g>
        );
      })}
      <path d="M300 26l-5 8h10z" className="hud__caret" />

      {hud.next && <CompassMarker {...place(hud.next.bearingDeg)} kind="stop" label={hud.next.label} />}
      {hud.hazards[0] && <CompassMarker {...place(hud.hazards[0].bearingDeg)} kind="hazard" label="!" />}
    </svg>
  );
}

function CompassMarker({ x, off, side, kind, label }: { x: number; off: boolean; side: number; kind: "stop" | "hazard"; label: string }) {
  return (
    <g transform={`translate(${x} 52)`}>
      {kind === "stop" ? <circle r="10" className="hud__m-stop" /> : <path d="M0 -11L11 9H-11z" className="hud__m-hazard" />}
      <text y={kind === "stop" ? 0.5 : 4} textAnchor="middle" dominantBaseline={kind === "stop" ? "central" : "auto"} className="hud__m-text">
        {label}
      </text>
      {off && <path d={side < 0 ? "M-15 0l-5-4v8z" : "M15 0l5-4v8z"} className="hud__m-arrow" />}
    </g>
  );
}

function SlopeGauge({ hud }: { hud: HudModel }) {
  const run = 110;
  const rise = Math.min(64, run * Math.tan((Math.min(hud.slopeDeg, 60) * Math.PI) / 180));
  return (
    <div className={`hud__block hud__slope hud__slope--${hud.slopeClass}`}>
      <span className="eyebrow">Slope here</span>
      <svg viewBox="0 0 130 76" className="hud__gauge" aria-hidden="true">
        <path d={`M8 68H${8 + run}`} className="hud__gauge-base" />
        <path d={`M8 68L${8 + run} ${68 - rise}`} className="hud__gauge-line" />
        <path d={`M${8 + run} 68V${68 - rise}`} className="hud__gauge-rise" />
      </svg>
      <p className="hud__big mono">{formatSlope(hud.slopeDeg)}</p>
      <p className="hud__status">
        <Icon name={LEVEL_ICON[hud.slopeClass]} /> {SLOPE_CLASS_LABEL[hud.slopeClass]}
      </p>
    </div>
  );
}

function LookAhead({ route, hud }: { route: RouteResponse; hud: HudModel }) {
  const R = 100;
  const scale = R / HUD_RANGE_M;
  const frame = (p: readonly [number, number]) => {
    const f = toHeadingFrame(p, hud.position, hud.headingDeg);
    return [R + f.right * scale, R - f.forward * scale] as const;
  };
  const pathOf = (pts: ReadonlyArray<readonly [number, number]>) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${frame(p).map((n) => n.toFixed(1)).join(" ")}`).join(" ");

  // North in the heading-up frame sits at angle -heading from "up".
  const h = (hud.headingDeg * Math.PI) / 180;
  return (
    <div className="hud__block hud__ahead">
      <span className="eyebrow">Route ahead</span>
      <svg viewBox={`-14 -14 ${2 * R + 28} ${2 * R + 28}`} className="hud__ring" role="img" aria-label={`Route ahead within ${HUD_RANGE_M} metres, heading up`}>
        <defs>
          <clipPath id="hud-ring-clip">
            <circle cx={R} cy={R} r={R - 1} />
          </clipPath>
        </defs>
        <circle cx={R} cy={R} r={R} className="hud__ring-bg" />
        <circle cx={R} cy={R} r={R / 2} className="hud__ring-mid" />
        <g clipPath="url(#hud-ring-clip)">
          {route.hazards.map((h) => {
            const ring = h.polygon.coordinates[0];
            return ring ? <path key={h.id} d={`${pathOf(ring)} Z`} className="hud__zone" /> : null;
          })}
          <path d={pathOf(route.polyline)} className="hud__route" />
          {route.stops.map((s, i) => {
            const [x, y] = frame([s.lon, s.lat]);
            return <circle key={s.id} cx={x} cy={y} r={4} className={i === hud.next?.index ? "hud__stop hud__stop--next" : "hud__stop"} />;
          })}
        </g>
        <path d={`M${R} ${R - 9}l6 14h-12z`} className="hud__me" />
        <text x={R - Math.sin(h) * (R + 9)} y={R - Math.cos(h) * (R + 9)} textAnchor="middle" dominantBaseline="central" className="hud__north">
          N
        </text>
      </svg>
      <p className="hud__caption mono">Range {formatDistance(HUD_RANGE_M)}, heading up</p>
    </div>
  );
}

/** Not driven by a live position feed: the position is set by the slider. See the banner. */
export function HudView({ onBackToPlan }: { onBackToPlan: () => void }) {
  const { state, stale } = usePlanner();
  const route = state.route;
  const total = useMemo(() => (route ? (profileExtent(route.profile)?.totalDist ?? 0) : 0), [route]);
  const first = route?.profile[0]?.dist_m ?? 0;
  const [posDistM, setPosDistM] = useState(0);

  // Keep the simulated position inside the route when a new route arrives.
  useEffect(() => {
    setPosDistM((p) => Math.min(Math.max(p, first), first + total));
  }, [first, total]);

  const hud = useMemo(() => (route ? computeHud(route, posDistM, SLOPE_LIMITS) : null), [route, posDistM]);

  if (!route || !hud) {
    return (
      <main className="card-screen">
        <div className="card-empty">
          <p className="empty__title">No route for the HUD</p>
          <p className="muted">The HUD shows heading, next stop, slope and hazards along a planned route. Plan one first.</p>
          <button type="button" className="btn btn--primary" onClick={onBackToPlan}>
            <Icon name="route" /> Back to Plan
          </button>
        </div>
      </main>
    );
  }

  const hazard = hud.hazards[0];
  const hazardRel = hazard ? relativeBearing(hazard.bearingDeg, hud.headingDeg) : 0;

  return (
    <main className="hud-screen">
      {stale && (
        <div className="hud-banner" role="note">
          <span>The route is out of date. Recalculate in Plan.</span>
        </div>
      )}

      <section className="hud" aria-label="Heads-up display">
        <div className="hud__top">
          <p className="hud__heading mono">
            <span className="eyebrow">HDG</span> {String(Math.round(hud.headingDeg) % 360).padStart(3, "0")}°
          </p>
          <CompassBar hud={hud} />
        </div>

        <div className="hud__row">
          <div className="hud__block hud__next">
            <span className="eyebrow">Next stop</span>
            {hud.next ? (
              <>
                <p className="hud__name">
                  <span className="pin">{hud.next.label}</span> {hud.next.name}
                </p>
                <p className="hud__big mono">{formatDistance(hud.next.distM)}</p>
                <p className="hud__caption mono">{describeBearing(relativeBearing(hud.next.bearingDeg, hud.headingDeg))}</p>
              </>
            ) : (
              <p className="hud__name">
                <Icon name="check" /> Destination reached
              </p>
            )}
            <p className="hud__caption mono">To destination {formatDistance(hud.destDistM)}</p>
          </div>

          <LookAhead route={route} hud={hud} />
          <SlopeGauge hud={hud} />
        </div>

        <div className="hud__alert" role="status">
          <Icon name="alert" />
          {hazard ? (
            <span>
              Nearest hazard: <strong>{hazard.label}</strong> <span className="mono">{formatDistance(hazard.distM)}, {describeBearing(hazardRel)}</span>
            </span>
          ) : (
            <span>No hazard zones on this route</span>
          )}
        </div>
      </section>

      <div className="hud-control">
        <label htmlFor="hud-pos">Simulated position along route</label>
        <input
          id="hud-pos"
          type="range"
          min={first}
          max={first + total}
          step={1}
          value={posDistM}
          onChange={(e) => setPosDistM(Number(e.target.value))}
          aria-valuetext={`${formatDistance(posDistM - first)} of ${formatDistance(total)}`}
        />
        <span className="mono">
          {formatDistance(posDistM - first)} / {formatDistance(total)}
        </span>
      </div>
    </main>
  );
}
