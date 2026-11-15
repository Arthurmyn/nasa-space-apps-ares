import { useEffect, useId, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { clampOffset, nextSnap, settle, snapOffsets, stepSnap, type Snap } from "../lib/sheet.ts";
import { uiStore, useUi } from "../state/uiStore.ts";

/** Height of the sheet that stays on screen at "peek": the handle and one line of summary. Keep equal to --sheet-peek in mobile.css. */
const PEEK_PX = 104;
/** A press that moves less than this is a tap, not a drag. */
const TAP_SLOP_PX = 6;

const SNAP_LABEL: Record<Snap, string> = { peek: "peek", half: "half height", full: "full height" };

interface Drag {
  pointerId: number;
  startY: number;
  startOffset: number;
  samples: Array<{ y: number; t: number }>;
  moved: boolean;
}

/**
 * The planner on a phone: a panel that slides up over the map and rests at three heights, peek, half
 * and full. Drag the handle row, or press Enter on it to step through the heights. The drag moves the
 * sheet one-to-one with the finger and, on release, carries the finger's speed into the choice of the
 * resting height. `summary` is what shows at peek; `children` scroll inside the sheet.
 */
export function BottomSheet({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const snap = useUi().sheetSnap;
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const bodyId = useId();

  const offsets = () => snapOffsets(sheetRef.current?.offsetHeight ?? 0, PEEK_PX);

  const move = (y: number) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    d.samples.push({ y, t: performance.now() });
    if (d.samples.length > 6) d.samples.shift();
    if (Math.abs(y - d.startY) > TAP_SLOP_PX) d.moved = true;
    if (d.moved) el.style.transform = `translateY(${clampOffset(d.startOffset + (y - d.startY), offsets())}px)`;
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !sheetRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startOffset: offsets()[snap], samples: [{ y: e.clientY, t: performance.now() }], moved: false };
    sheetRef.current.classList.add("sheet--dragging");
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === e.pointerId) move(e.clientY);
  };

  const finish = (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || d.pointerId !== e.pointerId || !el) return;
    drag.current = null;
    el.classList.remove("sheet--dragging");
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const seconds = first && last && last.t > first.t ? (last.t - first.t) / 1000 : 0;
    const velocity = seconds > 0 && first && last ? (last.y - first.y) / seconds : 0;
    const current = clampOffset(d.startOffset + (e.clientY - d.startY), offsets());
    el.style.transform = ""; // hand the position back to the stylesheet, which animates to the resting height
    if (cancelled) return;
    uiStore.setSheetSnap(d.moved ? settle(current, velocity, offsets()) : nextSnap(snap));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      uiStore.setSheetSnap(stepSnap(snap, e.key === "ArrowUp" ? -1 : 1));
      e.preventDefault();
    } else if (e.key === "Enter" || e.key === " ") {
      uiStore.setSheetSnap(nextSnap(snap));
      e.preventDefault();
    }
  };

  // Escape lowers the sheet one step, the way it closes any other panel.
  useEffect(() => {
    if (snap === "peek") return;
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") uiStore.setSheetSnap(stepSnap(snap, 1));
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [snap]);

  const closed = snap === "peek";
  return (
    <section ref={sheetRef} id="route-sheet" className="sheet" data-snap={snap} aria-label="Route planner">
      <div
        className="sheet__head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
      >
        <button
          type="button"
          className="sheet__grip"
          aria-expanded={!closed}
          aria-controls={bodyId}
          aria-label={`Route planner, ${SNAP_LABEL[snap]}. Press Enter to change the height, or use the up and down arrows.`}
          onKeyDown={onKeyDown}
        >
          <span className="sheet__bar" aria-hidden="true" />
        </button>
        <div className="sheet__summary">{summary}</div>
      </div>
      {/* At peek the body is below the screen edge: keep it out of the tab order and the reading order. */}
      <div id={bodyId} className="sheet__body" {...(closed ? { inert: "" } : {})} aria-hidden={closed || undefined}>
        {children}
      </div>
    </section>
  );
}
