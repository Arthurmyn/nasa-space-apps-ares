import "maplibre-gl/dist/maplibre-gl.css";
import "../map/worker.ts";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Map as MapLibreMap, Marker, Popup, type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";
import { fetchGlobalSites } from "../api/globalSites.ts";
import { Icon } from "../components/Icon.tsx";
import { TILE_SOURCES } from "../config/tiles.ts";
import { formatCoordinates } from "../lib/format.ts";
import { activeNear, countByType, GLOBAL_SITE_TYPES, TYPE_LABEL, type GlobalSite, type GlobalSiteType } from "../lib/globalSites.ts";
import { EQUIRECT_SCHEME, registerEquirectProtocol } from "../map/equirectProtocol.ts";
import { ZoomControls } from "../map/MapOverlays.tsx";
import { getMapTheme, prefersReducedMotion } from "../map/theme.ts";

/** The whole planet, without the extreme latitudes that Web Mercator stretches. */
const WORLD: LngLatBoundsLike = [
  [-180, -75],
  [180, 75],
];
const PADDING_PX = 24;
/** MapLibre's world is 512 px wide at zoom 0, and a sphere's circumference is that world. */
const WORLD_PX_AT_ZOOM_0 = 512;
/** Zoom the flight to a site ends on: close enough that its grid fills most of the view. */
const SITE_ZOOM = 12;
/**
 * Size asked for the sphere, as a share of the shorter side. MapLibre draws its globe about 0.79 times
 * the size this formula gives (measured at 1280 x 800), so 1.12 comes out at about 0.88 of the view.
 */
const GLOBE_FILL = 1.12;
/** Where the globe opens: over the ARES sites in Gale crater. */
const GLOBE_CENTRE: [number, number] = [137, 0];
const GLOBE_AVAILABLE = typeof MapLibreMap.prototype.setProjection === "function";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; sites: readonly GlobalSite[] };

/** Marker shapes differ as well as colours, so the types read without colour. */
const SHAPE: Record<GlobalSiteType, string> = {
  active: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  landing: "M12 3.5l8 14.5H4L12 3.5z",
  landmark: "M12 3l8 9-8 9-8-9 8-9z",
};

function markerElement(site: GlobalSite, selected: boolean, onPick: (byKeyboard: boolean) => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `ov-marker ov-marker--${site.type}${selected ? " is-selected" : ""}`;
  el.setAttribute("aria-label", `${site.name}, ${TYPE_LABEL[site.type].one}`);
  const size = site.type === "active" ? 28 : 20;
  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${SHAPE[site.type]}" fill-rule="evenodd"/></svg>`;
  const label = document.createElement("span");
  label.className = "ov-marker__label";
  label.textContent = site.name;
  el.append(label);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    // A click from the keyboard has no pointer position: detail is 0.
    onPick(e.detail === 0);
  });
  return el;
}

function MarkerGlyph({ type }: { type: GlobalSiteType }) {
  return (
    <svg className={`ov-glyph ov-glyph--${type}`} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={SHAPE[type]} fillRule="evenodd" />
    </svg>
  );
}

function SitePopup({ site, all, onOpen }: { site: GlobalSite; all: readonly GlobalSite[]; onOpen: (id: string) => void }) {
  const others = site.type === "active" ? activeNear(all, site) : [];
  return (
    <div className="ov-popup">
      <p className="eyebrow">{TYPE_LABEL[site.type].one}</p>
      <h3 className="ov-popup__name">{site.name}</h3>
      <p className="ov-popup__coords mono">{formatCoordinates(site.lat, site.lon, 3)}</p>
      {site.note && <p className="ov-popup__note">{site.note}</p>}
      {site.source && (
        <p className="ov-popup__source">
          Source:{" "}
          {site.source.url ? (
            <a href={site.source.url} target="_blank" rel="noopener noreferrer">
              {site.source.title}
            </a>
          ) : (
            site.source.title
          )}
        </p>
      )}
      {site.type === "active" ? (
        <div className="ov-popup__actions">
          <button type="button" className="btn btn--primary" onClick={() => onOpen(site.id)}>
            Open in ARES
          </button>
          {others.map((o) => (
            <button key={o.id} type="button" className="btn" onClick={() => onOpen(o.id)}>
              Open {o.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="ov-popup__todo">
          <Icon name="info" size={14} /> Terrain data not loaded yet
        </p>
      )}
    </div>
  );
}

interface OverviewViewProps {
  /** Goes up by one each time the "Mars overview" button is pressed while the overview is open: back to the whole planet. */
  resetSignal: number;
  onOpenSite: (siteId: string) => void;
}

/**
 * The first page: the whole of Mars on the Viking MDIM basemap, with markers for the ARES sites,
 * the landing sites and a few landmarks. An ARES site opens in the planner.
 */
export default function OverviewView({ resetSignal, onOpenSite }: OverviewViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState<ReadonlySet<GlobalSiteType>>(() => new Set(GLOBAL_SITE_TYPES));
  const [globe, setGlobe] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popupEl, setPopupEl] = useState<HTMLElement | null>(null);
  const userMoved = useRef(false);
  const opening = useRef(false);
  const viaKeyboard = useRef(false);
  const popupRef = useRef<Popup | null>(null);

  const sites = load.status === "ready" ? load.sites : [];
  const selected = useMemo(() => sites.find((s) => s.id === selectedId) ?? null, [sites, selectedId]);
  const counts = useMemo(() => countByType(sites), [sites]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoad({ status: "loading" });
    fetchGlobalSites(ctrl.signal)
      .then((list) => setLoad({ status: "ready", sites: list }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        console.error("Failed to load the overview markers", e);
        setLoad({ status: "error" });
      });
    return () => ctrl.abort();
  }, [attempt]);

  // The map. Created once; the basemap is the Viking mosaic, reprojected from its equirectangular grid.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const cfg = TILE_SOURCES.optical;
    if (cfg.url === null) {
      setMapError("No basemap is configured.");
      return;
    }
    let instance: MapLibreMap;
    try {
      registerEquirectProtocol();
      const theme = getMapTheme();
      const style: StyleSpecification = {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: [`${EQUIRECT_SCHEME}://optical/{z}/{x}/{y}`],
            // 128 px of map per tile means MapLibre asks for a level twice as deep: sharper at world zoom.
            tileSize: 128,
            minzoom: cfg.minzoom,
            maxzoom: cfg.maxzoom,
            attribution: cfg.attribution,
          },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": theme.bg } },
          { id: "basemap", type: "raster", source: "basemap", paint: { "raster-fade-duration": 0 } },
        ],
      };
      instance = new MapLibreMap({
        container: host,
        style,
        bounds: WORLD,
        fitBoundsOptions: { padding: PADDING_PX },
        minZoom: 0,
        maxZoom: 14,
        renderWorldCopies: false,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
        attributionControl: { compact: true },
        reduceMotion: prefersReducedMotion(),
      });
      instance.touchZoomRotate.disableRotation();
      instance.getCanvas().setAttribute("aria-label", "Map of Mars. Drag to pan, plus and minus to zoom. Markers are buttons.");
      instance.once("load", () => {
        setMap(instance);
      });
    } catch (e) {
      console.error("Map failed to start", e);
      setMapError("The map could not start. This browser may not support WebGL 2.");
      return;
    }

    // Keep the planet framed while the window settles, until the user takes the map.
    instance.on("movestart", (e) => {
      if (e.originalEvent) userMoved.current = true;
    });
    const observer = new ResizeObserver(() => {
      if (userMoved.current || host.clientWidth < 2 || host.clientHeight < 2) return;
      instance.resize();
      const camera = instance.cameraForBounds(WORLD, { padding: PADDING_PX });
      if (camera) instance.jumpTo(camera);
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      instance.remove();
      setMap(null);
    };
  }, []);

  const frameWorld = useCallback((m: MapLibreMap, asGlobe: boolean) => {
    userMoved.current = false;
    const duration = prefersReducedMotion() ? 0 : 600;
    if (!asGlobe) {
      m.fitBounds(WORLD, { padding: PADDING_PX, duration });
      return;
    }
    // fitBounds frames a flat map by its width, which would crop the sphere: size it by the shorter side.
    const { clientWidth: w, clientHeight: h } = m.getContainer();
    const zoom = Math.log2((Math.PI * GLOBE_FILL * Math.min(w, h)) / WORLD_PX_AT_ZOOM_0);
    m.easeTo({ center: GLOBE_CENTRE, zoom: Math.max(zoom, 0), duration });
  }, []);

  // "Mars overview" pressed again: back to the whole planet.
  const firstSignal = useRef(resetSignal);
  useEffect(() => {
    if (!map || resetSignal === firstSignal.current) return;
    firstSignal.current = resetSignal;
    setSelectedId(null);
    frameWorld(map, globe);
  }, [map, resetSignal, frameWorld, globe]);

  // Markers: one button per site of a type that is switched on.
  useEffect(() => {
    if (!map) return;
    const markers = sites
      .filter((s) => shown.has(s.type))
      .map((s) => new Marker({ element: markerElement(s, s.id === selectedId, (byKeyboard) => {
          viaKeyboard.current = byKeyboard;
          setSelectedId(s.id);
        }), opacityWhenCovered: "0" }).setLngLat([s.lon, s.lat]).addTo(map));
    return () => markers.forEach((m) => m.remove());
  }, [map, sites, shown, selectedId]);

  // A hidden type cannot stay selected.
  useEffect(() => {
    if (selected && !shown.has(selected.type)) setSelectedId(null);
  }, [selected, shown]);

  // The popup of the selected marker. Its body is React, drawn through a portal.
  useEffect(() => {
    if (!map || !selected) return;
    const el = document.createElement("div");
    const popup = new Popup({ offset: selected.type === "active" ? 20 : 14, maxWidth: "300px", closeOnClick: true, focusAfterOpen: viaKeyboard.current })
      .setLngLat([selected.lon, selected.lat])
      .setDOMContent(el)
      .addTo(map);
    popupRef.current = popup;
    setPopupEl(el);
    popup.on("close", () => setSelectedId((cur) => (cur === selected.id ? null : cur)));
    return () => {
      popupRef.current = null;
      setPopupEl(null);
      popup.remove();
    };
  }, [map, selected]);

  // MapLibre picks the side the popup opens to from its size, and the body only exists once React has
  // drawn it into the popup. Place it again then, so it stays inside the map on a narrow screen.
  useLayoutEffect(() => {
    if (popupEl && selected) popupRef.current?.setLngLat([selected.lon, selected.lat]);
  }, [popupEl, selected]);

  // Escape closes the popup, as it does for the planner's drawers.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  useEffect(() => {
    if (!map || !GLOBE_AVAILABLE) return;
    map.setProjection({ type: globe ? "globe" : "mercator" });
    frameWorld(map, globe);
  }, [map, globe, frameWorld]);

  const open = useCallback(
    (id: string) => {
      const site = sites.find((s) => s.id === id);
      if (!map || !site || opening.current) return;
      opening.current = true;
      const done = () => {
        opening.current = false;
        onOpenSite(id);
      };
      if (prefersReducedMotion()) {
        done();
        return;
      }
      map.once("moveend", done);
      map.flyTo({ center: [site.lon, site.lat], zoom: SITE_ZOOM, duration: 1400, essential: true });
    },
    [map, sites, onOpenSite],
  );

  const toggleType = (t: GlobalSiteType) =>
    setShown((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  if (mapError) {
    return (
      <div className="map-wrap map-wrap--error" role="alert">
        <Icon name="alert" size={20} />
        <p>{mapError}</p>
      </div>
    );
  }

  return (
    <main className="map-wrap ov">
      <div ref={hostRef} className="ares-map ov-map" />
      {map && <ZoomControls map={map} />}

      <section className="ov-panel" aria-label="Map legend">
        <h2 className="eyebrow">Mars overview</h2>
        {load.status === "loading" && (
          <p className="ov-panel__status" role="status">
            <span className="spinner" aria-hidden="true" /> Loading markers
          </p>
        )}
        {load.status === "error" && (
          <div className="ov-panel__status" role="alert">
            <p>The markers could not be loaded.</p>
            <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </button>
          </div>
        )}
        {load.status === "ready" && sites.length === 0 && <p className="ov-panel__status">No markers to show.</p>}
        {load.status === "ready" && sites.length > 0 && (
          <ul className="ov-legend">
            {GLOBAL_SITE_TYPES.filter((t) => counts[t] > 0).map((t) => (
              <li key={t}>
                <label className="ov-legend__row">
                  <input type="checkbox" checked={shown.has(t)} onChange={() => toggleType(t)} />
                  <MarkerGlyph type={t} />
                  <span className="ov-legend__label">{TYPE_LABEL[t].many}</span>
                  <span className="ov-legend__count mono">{counts[t]}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {GLOBE_AVAILABLE && (
          <label className="ov-globe">
            <input type="checkbox" checked={globe} onChange={(e) => setGlobe(e.target.checked)} />
            <Icon name="globe" size={14} /> Globe view
          </label>
        )}
      </section>

      {selected && popupEl && createPortal(<SitePopup site={selected} all={sites} onOpen={open} />, popupEl)}
    </main>
  );
}
