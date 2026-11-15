import type { RouteResponse } from "../api/types.ts";
import { SLOPE_LIMITS } from "../config/route.ts";
import { formatDistance, formatDuration, formatSignedElevation } from "../lib/format.ts";
import { evaShare, formatPct, slopeSegments } from "../lib/routeInsight.ts";
import { isUnverified } from "./SourceText.tsx";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt className="stat__label">{label}</dt>
      <dd className="stat__value mono">{value}</dd>
    </div>
  );
}

/** Distance by slope class as one bar. The numbers sit under it, so the classes read without colour. */
export function SlopeBar({ pct }: { pct: NonNullable<RouteResponse["stats"]>["slope_class_pct"] }) {
  const segments = slopeSegments(pct, SLOPE_LIMITS.cautionDeg, SLOPE_LIMITS.maxDeg);
  const summary = segments.map((s) => `${formatPct(s.pct)} ${s.label.toLowerCase()}`).join(", ");
  return (
    <div className="slope-bar">
      <span className="stat__label">Distance by slope</span>
      <div className="slope-bar__track" role="img" aria-label={`Distance by slope class: ${summary}`}>
        {segments.map((s) => s.pct > 0 && <span key={s.cls} className={`slope-bar__seg slope-bar__seg--${s.cls}`} style={{ flexGrow: s.pct }} />)}
      </div>
      <ul className="slope-bar__legend">
        {segments.map((s) => (
          <li key={s.cls}>
            <span className={`legend__swatch legend__swatch--${s.cls}`} aria-hidden="true" />
            <span className="mono">{formatPct(s.pct)}</span>
            <span className="slope-bar__name">
              {s.label} <span className="mono">{s.range}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Round trip, the way back, climb and descent, and the slope bar: the numbers added with route profiles. */
export function TripStats({ route }: { route: RouteResponse }) {
  const { stats } = route;
  const hasReturn = route.return !== undefined;
  const share = evaShare(route.round_trip_time_s, route.eva_limit_s);
  const evaRow = route.assumptions.find((a) => /EVA/i.test(a.name));
  if (!stats && !hasReturn && route.round_trip_time_s === undefined) return null;
  return (
    <div className="trip">
      <dl className="stat-grid stat-grid--two">
        {route.round_trip_time_s !== undefined && <Stat label="Round trip" value={route.round_trip_time_s === null ? "No path back" : formatDuration(route.round_trip_time_s)} />}
        {route.return !== undefined && <Stat label="Way back" value={route.return ? `${formatDistance(route.return.distance_m)}, ${formatDuration(route.return.est_time_s)}` : "No path back"} />}
        {stats && <Stat label="Climb" value={formatSignedElevation(stats.climb_m, "+")} />}
        {stats && <Stat label="Descent" value={formatSignedElevation(stats.descent_m, "−")} />}
      </dl>
      {share !== null && route.eva_limit_s != null && (
        <p className="muted trip__eva">
          Round trip is {formatPct(share)} of the {formatDuration(route.eva_limit_s)} EVA limit.
          {evaRow && isUnverified(evaRow.source) && <> <span className="tag tag--warn">TO VERIFY</span></>}
        </p>
      )}
      {stats && <SlopeBar pct={stats.slope_class_pct} />}
    </div>
  );
}
