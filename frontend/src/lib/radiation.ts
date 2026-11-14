const SECONDS_PER_DAY = 86400;

/** Dose equivalent in mSv for a walk of `durationS` seconds at a constant rate in mSv per day. */
export function estimatedDoseMsv(rateMsvPerDay: number, durationS: number): number | null {
  if (!Number.isFinite(rateMsvPerDay) || !Number.isFinite(durationS) || rateMsvPerDay < 0 || durationS < 0) return null;
  return (rateMsvPerDay * durationS) / SECONDS_PER_DAY;
}

/** "16 µSv" below 0.1 mSv, "0.25 mSv" above; a walk is small against a daily rate, so µSv is common. */
export function formatDose(msv: number | null): string {
  if (msv === null || !Number.isFinite(msv)) return "–";
  const nbsp = " ";
  if (msv < 0.1) return `${Math.round(msv * 1000)}${nbsp}µSv`;
  return `${msv.toFixed(2)}${nbsp}mSv`;
}
