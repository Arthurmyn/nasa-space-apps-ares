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

// These two numbers must equal slope_caution_deg and slope_limit_deg in
// backend/data/gale-bx/assumptions.json; a test (config/route.test.ts) compares them. Every slope
// class on screen derives from them. They are ARES planning values, see the assumptions on the card.
export const SLOPE_LIMITS = {
  /** Above this slope a segment is "caution", degrees. */
  cautionDeg: 10,
  /** Hard limit sent to the API as `constraints.max_slope_deg`; above it a segment is "avoid". */
  maxDeg: 15,
} as const;

/** HUD look-ahead ring radius, metres. Display scale only; it does not affect any route logic. */
export const HUD_RANGE_M = 400;

/** Furthest straight-line distance from the start the plan should stay within, metres. Mirrors "Max distance from lander" in assumptions.json. */
export const MAX_DISTANCE_FROM_START_M = 2000;

/** Planned minutes at each stop, sent as `stop_time_min` and added to the EVA time. ARES planning input, not a NASA value. */
export const DEFAULT_STOP_TIME_MIN = 15;
export const STOP_TIME_OPTIONS_MIN = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120] as const;
