import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Popup, type Map as MapLibreMap } from "maplibre-gl";
import { api } from "../api/client.ts";
import { loadTerrain, type Terrain } from "../api/terrain.ts";
import type { GeologyResponse } from "../api/types.ts";
import { Icon } from "../components/Icon.tsx";
import { formatCoordinates, formatElevation, formatSlope } from "../lib/format.ts";
import { geologyCaveat, geologyLabel, geologyScope, terrainAt, type TerrainAt } from "../lib/inspect.ts";
import { useApp } from "../state/PlannerContext.tsx";
import { useSite } from "../state/SiteContext.tsx";
import { uiStore, useUi } from "../state/uiStore.ts";

/** The point inspector's switch, with the zoom buttons: while it is on, a click on the map inspects the point. */
export function InspectToggle() {
  const on = useUi().inspectOn;
  return (
    <button
      type="button"
      className="btn map-inspect"
      aria-pressed={on}
      title="Inspect a point: elevation, slope and geology"
      onClick={() => uiStore.setInspectOn(!on)}
    >
      <Icon name="crosshair" /> Inspect
    </button>
  );
}

interface Point {
  lon: number;
  lat: number;
  n: number;
}

type GeologyState = { status: "loading" } | { status: "done"; value: GeologyResponse };

/** The rows under a clicked point. Each value is "No data" when the site or the map has none there. */
function InspectBody({ point, onClose }: { point: Point; onClose: () => void }) {
  const { site } = useSite();
  const { slope } = useApp();
  const [terrain, setTerrain] = useState<Terrain | null | "failed">(null);
  const [geology, setGeology] = useState<GeologyState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    loadTerrain(site.id)
      .then((t) => live && setTerrain(t))
      .catch((e: unknown) => {
        console.warn("Terrain unavailable for the inspector", e);
        if (live) setTerrain("failed");
      });
    return () => {
      live = false;
    };
  }, [site.id]);

  useEffect(() => {
    const ctrl = new AbortController();
    setGeology({ status: "loading" });
    api
      .geology(point.lon, point.lat, site.id, ctrl.signal)
      .then((value) => !ctrl.signal.aborted && setGeology({ status: "done", value }))
      .catch(() => undefined); // an aborted request: the next click has its own
    return () => ctrl.abort();
  }, [point, site.id]);

  const t: TerrainAt = terrainAt(terrain && terrain !== "failed" ? terrain.meta : null, terrain && terrain !== "failed" ? terrain.elevation : null, site.grid, { lon: site.lon, lat: site.lat }, slope, point.lon, point.lat);
  const geo = geology.status === "done" ? geology.value : null;

  return (
    <div className="inspect">
      <div className="inspect__head">
        <p className="eyebrow">Point</p>
        <button type="button" className="btn btn--icon btn--ghost" aria-label="Close inspector popup" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <p className="inspect__coords mono">{formatCoordinates(point.lat, point.lon, 5)}</p>
      <dl className="inspect__rows">
        <div>
          <dt>Elevation</dt>
          <dd className="mono">{t.elevationM === null ? "No data" : formatElevation(t.elevationM)}</dd>
        </div>
        <div>
          <dt>Slope</dt>
          <dd className="mono">{t.slopeDeg === null ? "No data" : formatSlope(t.slopeDeg)}</dd>
        </div>
        <div>
          <dt>Geology</dt>
          <dd>
            {geology.status === "loading" ? <span className="muted">Loading</span> : geologyLabel(geo)}
            {geo && !geo.available && <span className="sr-only">. {geo.reason}</span>}
          </dd>
        </div>
      </dl>
      {geo?.available && (
        <p className="inspect__note">
          <strong>{geologyCaveat(geo)}</strong>
          {geologyScope(geo) && <> {geologyScope(geo)}</>}{" "}
          <a href={geo.source.url} target="_blank" rel="noreferrer">
            {geo.source.title}
          </a>
        </p>
      )}
    </div>
  );
}

/** A popup on the map at the inspected point, drawn with React through a portal. Escape or the close button dismisses it. */
export function InspectPopup({ map, point, onClose }: { map: MapLibreMap; point: Point | null; onClose: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!point) return;
    const el = document.createElement("div");
    const popup = new Popup({ offset: 10, maxWidth: "280px", closeButton: false, closeOnClick: false, className: "inspect-popup" })
      .setLngLat([point.lon, point.lat])
      .setDOMContent(el)
      .addTo(map);
    setHost(el);
    return () => {
      setHost(null);
      popup.remove();
    };
  }, [map, point]);

  useEffect(() => {
    if (!point) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Capture phase: the map's own key handler stops Escape before it reaches the window.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [point, onClose]);

  return point && host ? createPortal(<InspectBody point={point} onClose={onClose} />, host) : null;
}
