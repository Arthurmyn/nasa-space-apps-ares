import { IMAGERY_CREDIT, imageryRows } from "../lib/imagery.ts";
import { uiStore, useUi } from "../state/uiStore.ts";

/** One switch for the Mars Trek imagery stack: CTX and the HiRISE mosaic above the Viking basemap. */
export function ImageryRow() {
  const on = useUi().imageryOn;
  return (
    <li className={`layer-row${on ? " layer-row--on" : ""}`}>
      <div className="layer-row__head">
        <div className="layer-row__text">
          <span id="overlay-imagery-label" className="layer-row__label">
            Imagery: Viking / CTX / HiRISE mosaic
          </span>
          <span id="overlay-imagery-desc" className="layer-row__desc">
            Sharper orbital images under the data layers. Viking stays underneath; CTX and the HiRISE mosaic appear where they exist as you zoom in.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="overlay-imagery-label"
          aria-describedby="overlay-imagery-desc"
          className="switch"
          onClick={() => uiStore.setImageryOn(!on)}
        >
          <span className="switch__thumb" />
          <span className="sr-only">{on ? "On" : "Off"}</span>
        </button>
      </div>
      {on && (
        <div className="layer-row__legend">
          <ul className="legend imagery-legend" aria-label="Imagery layers">
            {imageryRows().map((r) => (
              <li key={r.id} className="legend__item imagery-legend__item">
                <span className="imagery-legend__name">{r.name}</span>
                <span className="mono">{r.resolution}</span>
                <span className="legend__text">{r.coverage}</span>
              </li>
            ))}
          </ul>
          <p className="legend__note">Resolution is the ground size of a pixel at the deepest tile level each layer offers.</p>
          <p className="legend__source">
            Source:{" "}
            <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noreferrer">
              {IMAGERY_CREDIT}
            </a>
          </p>
        </div>
      )}
    </li>
  );
}
