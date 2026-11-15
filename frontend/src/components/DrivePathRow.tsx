import { useMemo } from "react";
import { formatDistance } from "../lib/format.ts";
import { relateToBbox } from "../lib/drivePath.ts";
import { useSite } from "../state/SiteContext.tsx";
import { drivePathStore, useDrivePath } from "../state/drivePathStore.ts";
import { uiStore, useUi } from "../state/uiStore.ts";
import { Icon } from "./Icon.tsx";

/** The full drive path of Curiosity, from the NASA traverse file. It is not a terrain layer of the site, so it has its own switch under the data layers. */
export function DrivePathRow() {
  const { drivePathOn: on } = useUi();
  const state = useDrivePath();
  const { site } = useSite();
  const relation = useMemo(() => (state.status === "ready" ? relateToBbox(state.data.lines, site.bbox) : null), [state, site.bbox]);

  return (
    <li className={`layer-row${on ? " layer-row--on" : ""}`}>
      <div className="layer-row__head">
        <div className="layer-row__text">
          <span id="overlay-drive-label" className="layer-row__label">
            Full drive path
          </span>
          <span id="overlay-drive-desc" className="layer-row__desc">
            Curiosity's full drive path
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="overlay-drive-label"
          aria-describedby="overlay-drive-desc"
          className="switch"
          onClick={() => uiStore.setDrivePathOn(!on)}
        >
          <span className="switch__thumb" />
          <span className="sr-only">{on ? "On" : "Off"}</span>
        </button>
      </div>
      {on && (
        <div className="layer-row__legend">
          <ul className="legend" aria-label="Drive path legend">
            <li className="legend__item">
              <span className="legend__swatch legend__swatch--drive" aria-hidden="true" />
              <span className="legend__text">Rover path</span>
            </li>
          </ul>
          {state.status === "loading" && (
            <p className="progress-text" role="status">
              <span className="spinner" aria-hidden="true" /> Loading the drive path
            </p>
          )}
          {state.status === "error" && (
            <p className="layer-row__reason" role="alert">
              <Icon name="alert" size={12} /> The drive path could not be loaded.{" "}
              <button type="button" className="btn btn--ghost" onClick={() => void drivePathStore.load()}>
                <Icon name="refresh" /> Retry
              </button>
            </p>
          )}
          {relation && !relation.inside && (
            <p className="legend__note legend__note--warn">
              <Icon name="info" size={12} /> The rover never drove through this site. The nearest part of its path is {formatDistance(relation.nearest.distanceM)} away, and the map shows it.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
