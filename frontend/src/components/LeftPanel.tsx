import { useId, useRef, type KeyboardEvent } from "react";
import { useApp, usePlanner } from "../state/PlannerContext.tsx";
import { uiStore, useUi, type SidePanel } from "../state/uiStore.ts";
import { ConditionsPanel } from "./ConditionsPanel.tsx";
import { Icon, type IconName } from "./Icon.tsx";
import { LayersPanel } from "./LayersPanel.tsx";
import { MethodPanel } from "./MethodPanel.tsx";
import { SiteContextNote } from "./SiteContextNote.tsx";
import { SitesPanel } from "./SitesPanel.tsx";

const PANELS: ReadonlyArray<{ id: SidePanel; label: string; title: string; icon: IconName }> = [
  { id: "layers", label: "Layers", title: "Map layers", icon: "layers" },
  { id: "sites", label: "Sites", title: "Sites", icon: "map" },
  { id: "conditions", label: "Conditions", title: "Site conditions", icon: "sun" },
  { id: "method", label: "Method", title: "Method and sources", icon: "doc" },
];

/** Layers drawn on the map right now: the API layers plus Curiosity's traverse where the site has one. */
function useActiveLayerCount(): number {
  const { layers, traverse } = useApp();
  const ui = useUi();
  return layers.active.size + (traverse && ui.traverseOn ? 1 : 0);
}

/**
 * The thin column of panel buttons on the left edge (desktop only). Each button opens its panel
 * beside the map; pressing the open one again closes it.
 */
export function SideRail() {
  const open = useUi().leftPanel;
  const count = useActiveLayerCount();
  return (
    <nav className="rail" aria-label="Side panels">
      {PANELS.map((p) => (
        <button
          key={p.id}
          type="button"
          className="rail__btn"
          aria-pressed={open === p.id}
          aria-controls="layers-drawer"
          aria-label={p.id === "layers" ? `${p.title}, ${count} on` : p.title}
          title={p.title}
          onClick={() => uiStore.toggleSidePanel(p.id)}
        >
          <Icon name={p.icon} size={18} />
          {p.id === "layers" && count > 0 && (
            <span className="rail__badge mono" aria-hidden="true">
              {count}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

function PanelBody({ panel }: { panel: SidePanel }) {
  if (panel === "layers") return <LayersPanel />;
  if (panel === "sites") return <SitesPanel />;
  if (panel === "conditions") return <ConditionsPanel />;
  return <MethodBody />;
}

/** The site's own context note (where one exists), then how the route is computed and every source. */
function MethodBody() {
  const route = usePlanner().state.route;
  return (
    <>
      <SiteContextNote />
      <MethodPanel route={route} />
    </>
  );
}

/**
 * The left flyout. On desktop the rail picks the panel and this shows it with a title and a close
 * button; in the narrow-screen drawer there is no rail, so tabs pick the panel instead.
 */
export function LeftPanel({ onClose }: { onClose: () => void }) {
  const panel = useUi().leftPanel ?? "layers";
  const current = PANELS.find((p) => p.id === panel) ?? PANELS[0]!;
  const base = useId();
  const refs = useRef<Partial<Record<SidePanel, HTMLButtonElement | null>>>({});

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = PANELS.findIndex((p) => p.id === panel);
    const next = PANELS[(i + (e.key === "ArrowRight" ? 1 : PANELS.length - 1)) % PANELS.length];
    if (!next) return;
    uiStore.showSidePanel(next.id);
    refs.current[next.id]?.focus();
    e.preventDefault();
  };

  return (
    <>
      <header className="flyout__head">
        <h2 id={`${base}-title`} className="flyout__title">
          {current.title}
        </h2>
        <button type="button" className="btn btn--icon flyout__close" aria-label={`Close ${current.title.toLowerCase()}`} title="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="tabs flyout__tabs" role="tablist" aria-label="Side panel" onKeyDown={onKeyDown}>
        {PANELS.map((p) => (
          <button
            key={p.id}
            ref={(el) => {
              refs.current[p.id] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-${p.id}`}
            aria-selected={panel === p.id}
            aria-controls={`${base}-panel`}
            tabIndex={panel === p.id ? 0 : -1}
            className="tabs__tab"
            onClick={() => uiStore.showSidePanel(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-title`}>
        <PanelBody panel={panel} />
      </div>
    </>
  );
}
