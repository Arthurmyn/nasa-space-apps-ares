import type { Map as MapLibreMap } from "maplibre-gl";
import { Icon } from "../components/Icon.tsx";
import { decimalsForStep, computeScaleBar } from "../lib/geo.ts";
import { formatLat, formatLon } from "../lib/format.ts";
import type { GridModel } from "./useGridModel.ts";
import { prefersReducedMotion } from "./theme.ts";

const EDGE_PAD = 56;
/** Labels closer than this would overlap, so the ones in between are left out. */
const MIN_LON_TICK_GAP_PX = 104;

/** Longitude labels along the top edge and latitude labels along the left edge. */
export function CoordinateTicks({ map, grid }: { map: MapLibreMap; grid: GridModel }) {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const digits = decimalsForStep(grid.stepDeg);
  const { lng, lat } = grid.centre;
  const visibleLons = spacedTicks(
    grid.lines.lons.map((lon) => ({ lon, x: map.project([lon, lat]).x })).filter(({ x }) => x >= EDGE_PAD && x <= w - EDGE_PAD),
    MIN_LON_TICK_GAP_PX,
  );

  return (
    <div className="map-ticks" aria-hidden="true">
      {visibleLons.map(({ lon, x }) => {
        return (
          <span key={`lon-${lon}`} className="map-tick map-tick--top mono" style={{ left: x }}>
            {formatLon(lon, digits)}
          </span>
        );
      })}
      {grid.lines.lats.map((l) => {
        const y = map.project([lng, l]).y;
        if (y < EDGE_PAD || y > h - EDGE_PAD) return null;
        return (
          <span key={`lat-${l}`} className="map-tick map-tick--left mono" style={{ top: y }}>
            {formatLat(l, digits)}
          </span>
        );
      })}
    </div>
  );
}

/** Scale bar in Mars metres. MapLibre's own ScaleControl assumes Earth, so it is not used. */
export function ScaleBar({ grid }: { grid: GridModel }) {
  const bar = computeScaleBar(grid.metresPerPx, 140);
  if (!bar) return null;
  return (
    <div className="map-scale" role="img" aria-label={`Scale bar: ${bar.label}`}>
      <span className="map-scale__label mono">{bar.label}</span>
      <span className="map-scale__bar" style={{ width: bar.widthPx }} />
    </div>
  );
}

/** The map never rotates, so north is always up. */
export function NorthArrow() {
  return (
    <div className="map-north" role="img" aria-label="North is up">
      <svg width="28" height="36" viewBox="0 0 28 36" aria-hidden="true">
        <path d="M14 3l7 20-7-4-7 4 7-20z" fill="currentColor" />
        <path d="M14 3l7 20-7-4z" fill="var(--text-muted)" />
      </svg>
      <span className="mono">N</span>
    </div>
  );
}

export function ZoomControls({ map }: { map: MapLibreMap }) {
  const duration = () => (prefersReducedMotion() ? 0 : 200);
  return (
    <div className="map-zoom" role="group" aria-label="Zoom">
      <button type="button" className="btn btn--icon" aria-label="Zoom in" onClick={() => map.zoomIn({ duration: duration() })}>
        <Icon name="plus" />
      </button>
      <button type="button" className="btn btn--icon" aria-label="Zoom out" onClick={() => map.zoomOut({ duration: duration() })}>
        <Icon name="minus" />
      </button>
    </div>
  );
}

/** Keep ticks left to right, dropping any that sit closer than `gap` px to the last one kept. */
function spacedTicks<T extends { x: number }>(ticks: readonly T[], gap: number): T[] {
  const kept: T[] = [];
  for (const t of [...ticks].sort((a, b) => a.x - b.x)) {
    const last = kept[kept.length - 1];
    if (!last || t.x - last.x >= gap) kept.push(t);
  }
  return kept;
}
