import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon.tsx";
import { LayersPanel } from "./LayersPanel.tsx";
import { SitesPanel } from "./SitesPanel.tsx";

type Tab = "layers" | "sites";
const TABS: ReadonlyArray<{ id: Tab; label: string; icon: "layers" | "map" }> = [
  { id: "layers", label: "Layers", icon: "layers" },
  { id: "sites", label: "Sites", icon: "map" },
];

/** The left column: map layers, or a choice of another site. */
export function LeftPanel() {
  const [tab, setTab] = useState<Tab>("layers");
  const base = useId();
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    if (!next) return;
    setTab(next.id);
    refs.current[next.id]?.focus();
    e.preventDefault();
  };

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Side panel" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${base}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            className="tabs__tab"
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-${tab}`}>
        {tab === "layers" ? <LayersPanel /> : <SitesPanel />}
      </div>
    </>
  );
}
