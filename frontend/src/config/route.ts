export const MAX_STOPS = 5;

/** Wait after the last edit before asking the API for a new route. */
export const ROUTE_DEBOUNCE_MS = 600;

/** How long a short notice stays on screen. */
export const NOTICE_MS = 5000;

/** Abort a route request that takes longer than this. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Arrow-key step for a selected stop, in screen pixels at the current zoom. */
export const KEY_STEP_PX = 12;
export const KEY_STEP_PX_FAST = 48;

/** Hover on the map snaps to the route within this many pixels. */
export const ROUTE_HOVER_SNAP_PX = 16;

// TODO(team): PLACEHOLDER thresholds. Confirm with the mission/science lead before the
// demo; every slope class on screen derives from these two numbers.
export const SLOPE_LIMITS = {
  /** Above this slope a segment is "caution", degrees. */
  cautionDeg: 10,
  /** Hard limit sent to the API as `constraints.max_slope_deg`; above it a segment is "avoid". */
  maxDeg: 15,
} as const;

/** HUD look-ahead ring radius, metres. Display scale only; it does not affect any route logic. */
export const HUD_RANGE_M = 400;
