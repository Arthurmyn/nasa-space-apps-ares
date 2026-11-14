import type { LayerId, LayerInfo } from "../api/types.ts";
import { LAYER_META, NO_DATA_REASON, type LayerMeta } from "../config/layers.ts";
import { SLOPE_LIMITS } from "../config/route.ts";
import { layerHasImagery } from "../config/tiles.ts";
import { SLOPE_CLASS_LABEL } from "../lib/slope.ts";
import { useLayers, type LayersModel } from "../state/PlannerContext.tsx";
import { Icon } from "./Icon.tsx";

interface RowState {
  disabled: boolean;
  reason: string | null;
}

function rowState(layers: LayersModel, id: LayerId): RowState {
  if (layers.status === "loading") return { disabled: true, reason: "Loading layer list" };
  if (layers.status === "error") return { disabled: true, reason: "Layer list unavailable" };
  const info: LayerInfo | undefined = layers.info[id];
  if (!info || !info.available) return { disabled: true, reason: info?.reason ?? NO_DATA_REASON };
  return { disabled: false, reason: null };
}

function SlopeLegend() {
  const items = [
    { cls: "ok", range: `0–${SLOPE_LIMITS.cautionDeg}°` },
    { cls: "caution", range: `${SLOPE_LIMITS.cautionDeg}–${SLOPE_LIMITS.maxDeg}°` },
    { cls: "avoid", range: `>${SLOPE_LIMITS.maxDeg}°` },
  ] as const;
  return (
    <ul className="legend" aria-label="Slope legend">
      {items.map((i) => (
        <li key={i.cls} className="legend__item">
          <span className={`legend__swatch legend__swatch--${i.cls}`} aria-hidden="true" />
          <span className="mono">{i.range}</span>
          <span className="legend__text">{SLOPE_CLASS_LABEL[i.cls]}</span>
        </li>
      ))}
    </ul>
  );
}

function SourceNote({ source }: { source: string }) {
  const parts = source
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return <p className="legend__source">Source: {source}</p>;
  return (
    <div className="legend__source">
      <span>Sources</span>
      <ul className="legend__source-list">
        {parts.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function LayerLegend({ meta, source }: { meta: LayerMeta; source: string | null }) {
  return (
    <div className="layer-row__legend">
      {meta.id === "slope" && <SlopeLegend />}
      {meta.isEstimate && <p className="legend__note">Estimate. Modelled, not measured.</p>}
      {source && <SourceNote source={source} />}
      {!layerHasImagery(meta.id) && (
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
      {on && <LayerLegend meta={meta} source={layers.info[meta.id]?.source ?? null} />}
    </li>
  );
}

export function LayersPanel() {
  const layers = useLayers();
  const available = LAYER_META.filter((m) => layers.info[m.id]?.available).length;
  const partial = layers.status === "ready" && available < LAYER_META.length;

  return (
    <section className="panel panel--left" aria-labelledby="layers-title">
      <header className="panel__head">
        <h2 id="layers-title" className="panel__title">
          <Icon name="layers" /> Layers
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
      </ul>
    </section>
  );
}
