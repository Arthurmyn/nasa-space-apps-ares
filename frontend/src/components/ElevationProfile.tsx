import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ProfilePoint } from "../api/types.ts";
import { SLOPE_LIMITS } from "../config/route.ts";
import { formatDistance, formatElevation, formatSlope, stopLabel } from "../lib/format.ts";
import {
  downsampleProfile,
  interpolateProfile,
  profileExtent,
  segmentsByClass,
} from "../lib/profile.ts";
import { SLOPE_CLASS_LABEL, classifySlope, type SlopeClass } from "../lib/slope.ts";
import { usePlanner } from "../state/PlannerContext.tsx";
import { hoverStore, useHover } from "../state/hoverStore.ts";
import { Icon } from "./Icon.tsx";
import { LEVEL_ICON } from "./SafetyBadge.tsx";

const M = { top: 24, right: 14, bottom: 24, left: 50 } as const;

/** Line style per class so the chart never relies on colour alone. */
const DASH: Record<SlopeClass, string | undefined> = {
  ok: undefined,
  caution: "7 3",
  avoid: "2 3",
};

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function Legend() {
  const items: Array<{ cls: SlopeClass; range: string }> = [
    { cls: "ok", range: `≤${SLOPE_LIMITS.cautionDeg}°` },
    { cls: "caution", range: `≤${SLOPE_LIMITS.maxDeg}°` },
    { cls: "avoid", range: `>${SLOPE_LIMITS.maxDeg}°` },
  ];
  return (
    <ul className="profile__legend" aria-label="Slope classes">
      {items.map((i) => (
        <li key={i.cls} className={`profile__chip profile__chip--${i.cls}`}>
          <Icon name={LEVEL_ICON[i.cls]} size={12} />
          <span className="mono">{i.range}</span>
          <span>{SLOPE_CLASS_LABEL[i.cls]}</span>
        </li>
      ))}
    </ul>
  );
}

interface ChartProps {
  profile: readonly ProfilePoint[];
  stops: ReadonlyArray<{ id: string; label: string; distM: number }>;
  width: number;
  height: number;
}

function Chart({ profile, stops, width, height }: ChartProps) {
  const hover = useHover();
  const svgRef = useRef<SVGSVGElement>(null);

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = Math.max(0, height - M.top - M.bottom);
  const extent = useMemo(() => profileExtent(profile), [profile]);

  const geometry = useMemo(() => {
    if (!extent || plotW < 20 || plotH < 20) return null;
    const first = profile[0];
    if (!first) return null;
    const pad = Math.max((extent.maxElev - extent.minElev) * 0.12, 5);
    const yMin = extent.minElev - pad;
    const yMax = extent.maxElev + pad;
    const x = (d: number) => M.left + (extent.totalDist > 0 ? ((d - first.dist_m) / extent.totalDist) * plotW : 0);
    const y = (e: number) => M.top + (1 - (e - yMin) / (yMax - yMin)) * plotH;

    const drawn = downsampleProfile(profile, Math.max(10, Math.floor(plotW / 2)));
    const bottom = M.top + plotH;
    const segments = segmentsByClass(drawn, SLOPE_LIMITS).map((seg) => {
      const pts = drawn.slice(seg.from, seg.to + 1);
      const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.dist_m).toFixed(1)} ${y(p.elev_m).toFixed(1)}`).join(" ");
      const last = pts[pts.length - 1];
      const head = pts[0];
      const area = last && head ? `${line} L${x(last.dist_m).toFixed(1)} ${bottom} L${x(head.dist_m).toFixed(1)} ${bottom} Z` : "";
      return { cls: seg.cls, line, area, key: `${seg.from}-${seg.to}` };
    });
    return { x, y, yMin, yMax, segments, first };
  }, [extent, profile, plotW, plotH]);

  if (!geometry || !extent) return null;
  const { x, y, segments, first } = geometry;
  const bottom = M.top + plotH;
  const hoverPoint = hover.distM !== null ? interpolateProfile(profile, hover.distM) : null;
  const hoverCls = hoverPoint ? classifySlope(hoverPoint.slope_deg, SLOPE_LIMITS) : null;
  const yTicks = [extent.minElev, (extent.minElev + extent.maxElev) / 2, extent.maxElev];
  const xTicks = [first.dist_m, first.dist_m + extent.totalDist / 2, first.dist_m + extent.totalDist];

  const distFromPointer = (e: PointerEvent<SVGRectElement>): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    const px = e.clientX - (rect?.left ?? 0) - M.left;
    const t = Math.min(1, Math.max(0, plotW > 0 ? px / plotW : 0));
    return first.dist_m + t * extent.totalDist;
  };

  const tooltip = hoverPoint && hoverCls ? `${formatDistance(hoverPoint.dist_m)}  ${formatElevation(hoverPoint.elev_m)}  ${formatSlope(hoverPoint.slope_deg)} ${SLOPE_CLASS_LABEL[hoverCls]}` : null;
  const hx = hoverPoint ? x(hoverPoint.dist_m) : 0;
  const tipW = 236;
  const tipX = hx + 10 + tipW > width - M.right ? hx - 10 - tipW : hx + 10;

  return (
    <svg ref={svgRef} className="profile__svg" width={width} height={height} aria-hidden="true">
      {yTicks.map((t) => (
        <g key={t}>
          <line className="profile__grid" x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} />
          <text className="profile__tick mono" x={M.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
            {formatElevation(t)}
          </text>
        </g>
      ))}
      {xTicks.map((t, i) => (
        <text
          key={t}
          className="profile__tick mono"
          x={x(t)}
          y={bottom + 15}
          textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
        >
          {formatDistance(t)}
        </text>
      ))}

      {segments.map((s) => (
        <g key={s.key} className={`profile__seg profile__seg--${s.cls}`}>
          <path className="profile__area" d={s.area} />
          <path className="profile__line" d={s.line} strokeDasharray={DASH[s.cls]} />
        </g>
      ))}

      {[{ id: "start", label: "S", distM: first.dist_m }, ...stops].map((s) => (
        <g key={s.id}>
          <line className="profile__stop-line" x1={x(s.distM)} x2={x(s.distM)} y1={M.top - 4} y2={bottom} />
          <circle className="profile__stop-dot" cx={x(s.distM)} cy={M.top - 12} r={9} />
          <text className="profile__stop-label" x={x(s.distM)} y={M.top - 12} textAnchor="middle" dominantBaseline="central">
            {s.label}
          </text>
        </g>
      ))}

      {hoverPoint && tooltip && (
        <g className="profile__hover">
          <line x1={hx} x2={hx} y1={M.top} y2={bottom} />
          <circle cx={hx} cy={y(hoverPoint.elev_m)} r={4} />
          <g transform={`translate(${tipX} ${M.top + 4})`}>
            <rect width={tipW} height={22} rx={4} />
            <text x={8} y={11} dominantBaseline="central" className="mono">
              {tooltip}
            </text>
          </g>
        </g>
      )}

      <rect
        className="profile__hit"
        x={M.left}
        y={M.top}
        width={plotW}
        height={plotH}
        onPointerMove={(e) => hoverStore.set(distFromPointer(e), "profile")}
        onPointerDown={(e) => hoverStore.set(distFromPointer(e), "profile")}
        onPointerLeave={() => {
          if (hoverStore.get().source === "profile") hoverStore.clear();
        }}
      />
    </svg>
  );
}

export function ElevationProfile() {
  const { state, view, stale } = usePlanner();
  const route = state.route;
  const [wrapRef, size] = useElementSize<HTMLDivElement>();
  const hover = useHover();

  const extent = useMemo(() => (route ? profileExtent(route.profile) : null), [route]);
  const stops = useMemo(
    () => route?.stops.map((s, i) => ({ id: s.id, label: stopLabel(i), distM: s.dist_m })) ?? [],
    [route],
  );

  const hoverPoint = route && hover.distM !== null ? interpolateProfile(route.profile, hover.distM) : null;
  const valueText = hoverPoint
    ? `${formatDistance(hoverPoint.dist_m)} along route, elevation ${formatElevation(hoverPoint.elev_m)}, slope ${formatSlope(hoverPoint.slope_deg)}`
    : "No position selected";

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!extent || !route) return;
    const first = route.profile[0]?.dist_m ?? 0;
    const step = extent.totalDist / (e.shiftKey ? 10 : 50);
    const cur = hover.distM ?? first;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - step;
    else if (e.key === "Home") next = first;
    else if (e.key === "End") next = first + extent.totalDist;
    else if (e.key === "Escape") {
      hoverStore.clear();
      return;
    }
    if (next === null) return;
    e.preventDefault();
    hoverStore.set(Math.min(first + extent.totalDist, Math.max(first, next)), "profile");
  };

  return (
    <section className="profile" aria-labelledby="profile-title">
      <header className="profile__head">
        <h2 id="profile-title" className="panel__title">
          <Icon name="mountain" /> Elevation profile
        </h2>
        {extent && (
          <span className="panel__meta mono">
            {formatDistance(extent.totalDist)} · {formatElevation(extent.minElev)} to {formatElevation(extent.maxElev)}
          </span>
        )}
        {stale && <span className="tag tag--warn">Out of date</span>}
        <Legend />
      </header>

      <div
        ref={wrapRef}
        className={`profile__body${stale ? " profile__body--stale" : ""}`}
        tabIndex={route ? 0 : -1}
        role={route ? "slider" : undefined}
        aria-label={route ? "Elevation profile position" : undefined}
        aria-valuemin={route ? 0 : undefined}
        aria-valuemax={extent ? Math.round(extent.totalDist) : undefined}
        aria-valuenow={route ? Math.round(hover.distM ?? 0) : undefined}
        aria-valuetext={route ? valueText : undefined}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (hoverStore.get().source === "profile") hoverStore.clear();
        }}
      >
        {route && size.w > 0 && <Chart profile={route.profile} stops={stops} width={size.w} height={size.h} />}
        {!route && view === "loading" && <div className="skeleton skeleton--fill" aria-hidden="true" />}
        {!route && view !== "loading" && (
          <p className="profile__empty muted">
            {view === "error" ? "No profile because the route could not be computed" : "The elevation profile appears once a route exists"}
          </p>
        )}
        {route && route.profile.length === 0 && <p className="profile__empty muted">The route service returned no elevation data</p>}
      </div>
    </section>
  );
}
