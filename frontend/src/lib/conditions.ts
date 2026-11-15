import type { ConditionsData } from "../api/types.ts";

/** Whole number with a real minus sign (U+2212), so negatives line up and read as numbers. */
const whole = (v: number): string => {
  const n = Math.round(v);
  return n < 0 ? `−${Math.abs(n)}` : String(n);
};

/** "−71 to −5 °C", or one end when the feed gave only one; null when it gave none. */
export function celsiusRange(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min === null || max === null) return `${whole((min ?? max) as number)} °C`;
  return `${whole(min)} to ${whole(max)} °C`;
}

/** Rows of the REMS card that the feed filled in, in reading order. A value the feed lacks is left out, never shown as 0. */
export function remsRows(d: ConditionsData): Array<[label: string, value: string]> {
  const rows: Array<[string, string | null]> = [
    ["Air", celsiusRange(d.air_temp_min_c, d.air_temp_max_c)],
    ["Ground", celsiusRange(d.ground_temp_min_c, d.ground_temp_max_c)],
    ["Pressure", d.pressure_pa === null ? null : `${whole(d.pressure_pa)} Pa${d.pressure_note ? `, ${d.pressure_note.toLowerCase()}` : ""}`],
    ["Sunrise, sunset", d.sunrise && d.sunset ? `${d.sunrise}, ${d.sunset}` : d.sunrise ?? d.sunset],
    ["UV index", d.uv_index],
    ["Sky", d.opacity],
    ["Wind", d.wind_speed === null ? null : `${d.wind_speed} m/s`],
  ];
  return rows.filter((r): r is [string, string] => r[1] !== null && r[1] !== "");
}
