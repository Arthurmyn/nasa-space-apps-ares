import { useId, type ReactNode } from "react";
import { Icon } from "./Icon.tsx";

/** A closed-by-default section of the side panel. The open state lives in the caller (uiStore), so it survives a mode switch. */
export function Drawer({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: (open: boolean) => void; children: ReactNode }) {
  const regionId = useId();
  return (
    <div className="drawer">
      <button type="button" className="drawer__toggle" aria-expanded={open} aria-controls={regionId} onClick={() => onToggle(!open)}>
        <span>{title}</span>
        <Icon name="chevron" className={open ? "chevron chevron--open" : "chevron"} />
      </button>
      <div id={regionId} className="drawer__body" hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}
