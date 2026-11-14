import { useId, useMemo } from "react";
import type { RouteResponse } from "../api/types.ts";
import { computeScaleBar, ringCentroid } from "../lib/geo.ts";
import { stopLabel } from "../lib/format.ts";
import { fitSketch } from "../lib/sketch.ts";

const W = 520;
const H = 440;
const PAD = 34;

/**
 * Static vector map of a route for the printable card: route, stops, hazard zones, scale bar
 * and north arrow. It is drawn from the same API data as the live map, not copied from it.
 */
export function RouteSketch({ route }: { route: RouteResponse }) {
  const hatchId = useId();
  const model = useMemo(() => {
    const points = [...route.polyline, ...route.hazards.flatMap((h) => h.polygon.coordinates.flat())];
    const fit = fitSketch(points, W, H, PAD);
    if (!fit) return null;
    const path = (coords: ReadonlyArray<readonly [number, number]>) =>
      coords.map((c, i) => `${i === 0 ? "M" : "L"}${fit.project(c).map((n) => n.toFixed(1)).join(" ")}`).join(" ");
    return { fit, path, scale: computeScaleBar(fit.metresPerUnit, 120) };
  }, [route]);

  if (!model) return <p className="card__muted">Not enough geometry to draw the route</p>;
  const { fit, path, scale } = model;
  const start = route.polyline[0];

  return (
    <svg className="sketch" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Route sketch, north is up">
      <defs>
        <pattern id={hatchId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" className="sketch__hatch" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} className="sketch__frame" />

      {route.hazards.map((h) => {
        const ring = h.polygon.coordinates[0] ?? [];
        const c = ringCentroid(ring);
        const [cx, cy] = c ? fit.project(c) : [0, 0];
        return (
          <g key={h.id}>
            <path d={`${path(ring)} Z`} fill={`url(#${hatchId})`} className="sketch__hazard" />
            <text x={cx} y={cy - 4} textAnchor="middle" className="sketch__label sketch__label--hazard">
              {h.label}
            </text>
          </g>
        );
      })}

      <path d={path(route.polyline)} className="sketch__route" />

      {start && <Pin at={fit.project(start)} label="S" start />}
      {route.stops.map((s, i) => (
        <Pin key={s.id} at={fit.project([s.lon, s.lat])} label={stopLabel(i)} />
      ))}

      {scale && (
        <g transform={`translate(${PAD - 10} ${H - 14})`}>
          <path d={`M0 -5 V0 H${scale.widthPx} V-5`} className="sketch__scale" />
          <text x="0" y="-9" className="sketch__label">
            {scale.label}
          </text>
        </g>
      )}
      <g transform={`translate(${W - 26} 30)`}>
        <path d="M0 -16 L7 8 L0 3 L-7 8 Z" className="sketch__north" />
        <text x="0" y="22" textAnchor="middle" className="sketch__label">
          N
        </text>
      </g>
    </svg>
  );
}

function Pin({ at, label, start = false }: { at: [number, number]; label: string; start?: boolean }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]})`}>
      <circle r="11" className={start ? "sketch__pin sketch__pin--start" : "sketch__pin"} />
      <text y="0.5" textAnchor="middle" dominantBaseline="central" className="sketch__pin-text">
        {label}
      </text>
    </g>
  );
}
