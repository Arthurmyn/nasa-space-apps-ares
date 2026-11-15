import { useEffect, useState } from "react";
import { apiUrl } from "../api/client.ts";
import { remsRows } from "../lib/conditions.ts";
import { useConditions } from "../state/useConditions.ts";
import { Icon } from "./Icon.tsx";

/**
 * Site conditions beside the route: space weather (the only live block, NASA CCMC DONKI through
 * the backend) and model climatology (Mars Climate Database). Labels are the verified ones from
 * ares_layers/facts/site_facts.json. Neither is a radiation dose or a weather forecast at Mars.
 */

interface Advisory {
  label: string;
  credit: string;
  status: "live" | "incomplete";
  fetched_at_utc: string;
  window: [string, string];
  events: Partial<Record<"FLR" | "SEP" | "CME", { count: number }>>;
  mars_cme_arrivals: { label: string; items: Array<{ cme_id: string; arrival_utc: string | null; glancing_blow: boolean | null }> } | null;
}

interface Weather {
  label: string;
  credit: string;
  source_url: string;
  query: { ls_deg: number };
  values: Record<string, { min: number; min_h: number; max: number; max_h: number }>;
  notes: string[];
}

type Load<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "error" };

function useJson<T>(url: string, check: (v: unknown) => v is T): Load<T> {
  const [load, setLoad] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    const ctrl = new AbortController();
    setLoad({ state: "loading" });
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((v: unknown) => setLoad(check(v) ? { state: "ready", data: v } : { state: "error" }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        console.warn(`Could not load ${url}`, e);
        setLoad({ state: "error" });
      });
    return () => ctrl.abort();
  }, [url, check]);
  return load;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isAdvisory = (v: unknown): v is Advisory => isObj(v) && typeof v.label === "string" && isObj(v.events) && Array.isArray(v.window);
const isWeather = (v: unknown): v is Weather => isObj(v) && typeof v.label === "string" && isObj(v.values) && isObj(v.query);

/** "8 Nov" from "2026-11-08" or a full ISO time, read in UTC. */
export function dayLabel(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "8 Nov, 12:00 UTC". */
export function dayTimeLabel(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${dayLabel(iso)}, ${d.toISOString().slice(11, 16)} UTC`;
}

/** Whole number with a real minus sign (U+2212), so negatives line up and read as numbers. */
export const signed = (v: number): string => {
  const n = Math.round(v);
  return n < 0 ? `−${Math.abs(n)}` : String(n);
};

const kelvinToC = (k: number) => `${signed(k - 273.15)} °C`;

function SpaceWeatherCard() {
  const load = useJson(apiUrl("/donki"), isAdvisory);
  return (
    <div className="conditions__card">
      <h3 className="conditions__title">
        Space weather <span className="badge badge--ok conditions__badge">LIVE</span>
      </h3>
      {load.state === "loading" && <p className="legend__note">Loading NASA DONKI</p>}
      {load.state === "error" && (
        <p className="legend__note legend__note--warn">
          <Icon name="wifiOff" size={12} /> Space weather unavailable
        </p>
      )}
      {load.state === "ready" && (
        <>
          <p className="conditions__label">{load.data.label}</p>
          <ul className="conditions__list mono">
            <li>Solar flares: {load.data.events.FLR?.count ?? "–"}</li>
            <li>CMEs: {load.data.events.CME?.count ?? "–"}</li>
            <li>SEP events: {load.data.events.SEP?.count ?? "–"}</li>
          </ul>
          <p className="legend__note">
            {dayLabel(load.data.window[0])} – {dayLabel(load.data.window[1])}, updated {dayTimeLabel(load.data.fetched_at_utc)}
            {load.data.status === "incomplete" ? ". Some feeds failed" : ""}
          </p>
          {load.data.mars_cme_arrivals && (
            <div className="conditions__sub">
              <p className="conditions__label">{load.data.mars_cme_arrivals.label}</p>
              {load.data.mars_cme_arrivals.items.length === 0 ? (
                <p className="legend__note">No predicted arrival in this window.</p>
              ) : (
                <ul className="conditions__list mono">
                  {load.data.mars_cme_arrivals.items.map((a) => (
                    <li key={`${a.cme_id}-${a.arrival_utc}`}>
                      {dayTimeLabel(a.arrival_utc)}
                      {a.glancing_blow ? " · glancing blow" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="legend__source">Source: {load.data.credit}</p>
        </>
      )}
    </div>
  );
}

const WEATHER_ROWS: ReadonlyArray<{ key: string; name: string; fmt: (v: number) => string }> = [
  { key: "surface_temperature_K", name: "Ground", fmt: kelvinToC },
  { key: "air_temperature_10m_K", name: "Air, 10 m", fmt: kelvinToC },
  { key: "surface_pressure_Pa", name: "Pressure", fmt: (v) => `${signed(v)} Pa` },
  { key: "we_wind_ms", name: "Wind W–E", fmt: (v) => `${signed(v)} m/s` },
];

function WeatherCard() {
  const load = useJson(`${import.meta.env.BASE_URL}context/weather.json`, isWeather);
  return (
    <div className="conditions__card">
      <h3 className="conditions__title">
        Weather <span className="badge badge--caution conditions__badge">MODEL</span>
      </h3>
      {load.state === "loading" && <p className="legend__note">Loading</p>}
      {load.state === "error" && <p className="legend__note legend__note--warn">Weather card unavailable</p>}
      {load.state === "ready" && (
        <>
          <p className="conditions__label">{load.data.label}</p>
          <table className="conditions__table mono">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Quantity</span>
                </th>
                <th scope="col">Min</th>
                <th scope="col">Max</th>
              </tr>
            </thead>
            <tbody>
              {WEATHER_ROWS.map((r) => {
                const v = load.data.values[r.key];
                if (!v) return null;
                return (
                  <tr key={r.key}>
                    <th scope="row">{r.name}</th>
                    <td>
                      {r.fmt(v.min)} <span className="conditions__h">{v.min_h}h</span>
                    </td>
                    <td>
                      {r.fmt(v.max)} <span className="conditions__h">{v.max_h}h</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="legend__note">
            Season Ls {load.data.query.ls_deg}°. {load.data.notes.join(" ")}
          </p>
          <p className="legend__source">
            Source:{" "}
            <a href={load.data.source_url} target="_blank" rel="noreferrer">
              {load.data.credit}
            </a>
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Curiosity's weather station, newest sol, through GET /conditions. It is the rover's own position
 * and not a forecast, so the card says so, and it carries the feed's outreach-only notice. When the
 * backend has no reading the card is not drawn at all: an empty box would say nothing useful.
 */
function RemsCard() {
  const conditions = useConditions();
  if (conditions.status !== "ready") return null;
  const d = conditions.data;
  const rows = remsRows(d);
  if (rows.length === 0) return null;
  return (
    <div className="conditions__card">
      <h3 className="conditions__title">
        Mars weather <span className="badge badge--ok conditions__badge">REMS</span>
      </h3>
      <p className="conditions__label">
        Curiosity rover, sol {d.sol ?? "–"}
        {d.earth_date ? `, ${dayLabel(d.earth_date)} ${d.earth_date.slice(0, 4)}` : ""}
        {d.ls_deg !== null ? `, Ls ${d.ls_deg}°` : ""}
      </p>
      <table className="conditions__table mono">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legend__note">Measured at the rover's own position, not a forecast and not on your route.</p>
      <p className="legend__note">{d.disclaimer}</p>
      <p className="legend__source">
        Source:{" "}
        <a href={d.source_url} target="_blank" rel="noreferrer">
          {d.provider}
        </a>
      </p>
    </div>
  );
}

export function ConditionsPanel() {
  return (
    <section className="panel__section conditions" aria-label="Site conditions">
      <RemsCard />
      <SpaceWeatherCard />
      <WeatherCard />
    </section>
  );
}

export function Disclaimer() {
  return <p className="disclaimer">Candidate route for planning support. Not a safety guarantee.</p>;
}
