const NBSP = " ";

/** "340 m", "4.86 km", "12.4 km". Metres below 1 km are rounded to whole metres. */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) return "–";
  const abs = Math.abs(metres);
  if (abs < 1000) return `${Math.round(metres)}${NBSP}m`;
  const km = metres / 1000;
  return `${km.toFixed(abs < 10_000 ? 2 : 1)}${NBSP}km`;
}

/** "3 h 42 min", "54 min", "< 1 min". Rounds to the nearest minute. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "–";
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 1) return `<${NBSP}1${NBSP}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}${NBSP}min`;
  return `${h}${NBSP}h${NBSP}${m}${NBSP}min`;
}

/** "12.4°" */
export function formatSlope(deg: number): string {
  return Number.isFinite(deg) ? `${deg.toFixed(1)}°` : "–";
}

/** "-12 m", "184 m" */
export function formatElevation(metres: number): string {
  return Number.isFinite(metres) ? `${Math.round(metres)}${NBSP}m` : "–";
}

export function formatLat(lat: number, digits = 4): string {
  const hemisphere = lat < 0 ? "S" : "N";
  return `${Math.abs(lat).toFixed(digits)}°${NBSP}${hemisphere}`;
}

export function formatLon(lon: number, digits = 4): string {
  const hemisphere = lon < 0 ? "W" : "E";
  return `${Math.abs(lon).toFixed(digits)}°${NBSP}${hemisphere}`;
}

/** "18.3814° N, 77.5342° E" */
export function formatCoordinates(lat: number, lon: number, digits = 4): string {
  return `${formatLat(lat, digits)}, ${formatLon(lon, digits)}`;
}

/** Map label for the nth stop: 0 -> "A", 25 -> "Z", then "AA"... (MAX_STOPS keeps this at A-E). */
export function stopLabel(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** "14:32:05 UTC" from an ISO timestamp; null when the input is not a valid date. */
export function formatUtcTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}${NBSP}UTC`;
}

/** Signed difference with an explicit sign: "+1.20 km", "−3 min". Uses a true minus sign. */
export function formatSigned(value: number, format: (abs: number) => string): string {
  if (!Number.isFinite(value)) return "–";
  if (value === 0) return format(0);
  return `${value > 0 ? "+" : "−"}${format(Math.abs(value))}`;
}
