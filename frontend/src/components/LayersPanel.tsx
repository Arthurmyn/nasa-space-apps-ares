import type { LayerId } from "../api/types.ts";
import { CARD_LAYERS, LAYER_META, NO_DATA_REASON, type LayerMeta } from "../config/layers.ts";
import { SLOPE_LIMITS } from "../config/route.ts";
import { layerHasImagery } from "../config/tiles.ts";
import { useApp, useLayers, type LayersModel } from "../state/PlannerContext.tsx";
import { useSite } from "../state/SiteContext.tsx";
import { uiStore, useUi } from "../state/uiStore.ts";
import type { TraverseStop } from "../lib/traverse.ts";
import { Icon } from "./Icon.tsx";
import { DrivePathRow } from "./DrivePathRow.tsx";
import { RadiationCard, ThermalInertiaCard } from "./LayerCards.tsx";

interface RowState {
  disabled: boolean;
  reason: string | null;
}

function rowState(layers: LayersModel, id: LayerId): RowState {
  const info = layers.info[id];
  if (info) return { disabled: !info.available, reason: info.available ? null : info.reason ?? NO_DATA_REASON };
  if (layers.status === "loading") return { disabled: true, reason: "Loading layer list" };
  if (layers.status === "error") return { disabled: true, reason: "Layer list unavailable" };
  return { disabled: true, reason: NO_DATA_REASON };
}

/** Upper display break of the slope layer, degrees (NASA EVA-EXP-0075 lunar suit design case). */
const STEEP_DEG = 20;

function SlopeLegend() {
  const items = [
    { cls: "ok", range: `≤${SLOPE_LIMITS.cautionDeg}°`, text: "" },
    { cls: "caution", range: `${SLOPE_LIMITS.cautionDeg}–${SLOPE_LIMITS.maxDeg}°`, text: "" },
    { cls: "avoid", range: `${SLOPE_LIMITS.maxDeg}–${STEEP_DEG}°`, text: `over ${SLOPE_LIMITS.maxDeg}° route limit` },
    { cls: "steep", range: `>${STEEP_DEG}°`, text: "" },
  ] as const;
  return (
    <>
      <ul className="legend" aria-label="Slope legend">
        {items.map((i) => (
          <li key={i.cls} className="legend__item">
            <span className={`legend__swatch legend__swatch--${i.cls}`} aria-hidden="true" />
            <span className="mono">{i.range}</span>
            <span className="legend__text">{i.text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function LayerLegend({ meta }: { meta: LayerMeta }) {
  const { site } = useSite();
  const noImagery = !CARD_LAYERS.includes(meta.id) && !layerHasImagery(meta.id, site.id);
  const hasContent = meta.id === "slope" || meta.id === "thermal" || meta.id === "radiation" || meta.isEstimate || noImagery;
  if (!hasContent) return null;
  return (
    <div className="layer-row__legend">
      {meta.id === "slope" && <SlopeLegend />}
      {meta.id === "thermal" && <ThermalInertiaCard />}
      {meta.id === "radiation" && <RadiationCard />}
      {meta.isEstimate && <p className="legend__note">Estimate. Modelled, not measured.</p>}
      {noImagery && (
        <p className="legend__note legend__note--warn">
          <Icon name="info" size={12} /> No imagery for this layer yet
        </p>
      )}
    </div>
  );
}

function LayerRow({ meta }: { meta: LayerMeta }) {
  const layers = useLayers();
  const { disabled, reason } = rowState(layers, meta.id);
  const on = !disabled && layers.active.has(meta.id);
  const labelId = `layer-${meta.id}-label`;
  const descId = `layer-${meta.id}-desc`;

  return (
    <li className={`layer-row${on ? " layer-row--on" : ""}${disabled ? " layer-row--disabled" : ""}`}>
      <div className="layer-row__head">
        <div className="layer-row__text">
          <span id={labelId} className="layer-row__label">
            {meta.label}
            {meta.isEstimate && <span className="tag">Estimate</span>}
          </span>
          <span id={descId} className="layer-row__desc">
            {meta.description}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          aria-describedby={descId}
          disabled={disabled}
          className="switch"
          onClick={() => layers.toggle(meta.id)}
        >
          <span className="switch__thumb" />
          <span className="sr-only">{on ? "On" : "Off"}</span>
        </button>
      </div>
      {reason && (
        <p className="layer-row__reason">
          <Icon name="info" size={12} /> {reason}
        </p>
      )}
      {on && <LayerLegend meta={meta} />}
    </li>
  );
}

/**
 * Curiosity's own traverse. A frontend-only layer: it is not in the API layer list and appears
 * only on a site that ships traverse.geojson.
 */
function TraverseRow({ stops }: { stops: readonly TraverseStop[] }) {
  const on = useUi().traverseOn;
  return (
    <li className={`layer-row${on ? " layer-row--on" : ""}`}>
      <div className="layer-row__head">
        <div className="layer-row__text">
          <span id="layer-traverse-label" className="layer-row__label">
            Curiosity traverse
          </span>
          <span id="layer-traverse-desc" className="layer-row__desc">
            Rover stops at this site ({stops.length})
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="layer-traverse-label"
          aria-describedby="layer-traverse-desc"
          className="switch"
          onClick={() => uiStore.toggleTraverse()}
        >
          <span className="switch__thumb" />
          <span className="sr-only">{on ? "On" : "Off"}</span>
        </button>
      </div>
      {on && (
        <div className="layer-row__legend">
          <ul className="legend" aria-label="Curiosity traverse legend">
            <li className="legend__item">
              <span className="legend__swatch legend__swatch--traverse" aria-hidden="true" />
              <span className="legend__dot legend__dot--traverse" aria-hidden="true" />
              <span className="legend__text">Rover track and stops</span>
            </li>
          </ul>
        </div>
      )}
    </li>
  );
}

export function LayersPanel() {
  const { layers, traverse } = useApp();
  const available = LAYER_META.filter((m) => layers.info[m.id]?.available).length;
  const partial = layers.status === "ready" && available < LAYER_META.length;

  return (
    <section className="panel panel--left" aria-labelledby="layers-title">
      <header className="panel__head">
        <h2 id="layers-title" className="sr-only">
          Layers
        </h2>
        {layers.status === "ready" && (
          <span className="panel__meta mono">
            {available}/{LAYER_META.length}
          </span>
        )}
      </header>

      {partial && (
        <p className="notice notice--warn" role="status">
          <Icon name="alert" /> Some layers have no data for this site
        </p>
      )}
      {layers.status === "error" && (
        <div className="notice notice--error" role="alert">
          <Icon name="wifiOff" />
          <span>Layer list could not be loaded</span>
          <button type="button" className="btn btn--ghost" onClick={layers.retry}>
            <Icon name="refresh" /> Retry
          </button>
        </div>
      )}

      <ul className="layer-list">
        {LAYER_META.map((meta) => (
          <LayerRow key={meta.id} meta={meta} />
        ))}
        {traverse && <TraverseRow stops={traverse} />}
        <DrivePathRow />
      </ul>
    </section>
  );
}
