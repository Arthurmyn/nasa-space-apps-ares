/** Map paint colours, read from the CSS tokens so tokens.css stays the single source. */
export interface MapTheme {
  bg: string;
  line: string;
  lineStrong: string;
  text: string;
  muted: string;
  accent: string;
  cyan: string;
  hazard: string;
  classOk: string;
  classCaution: string;
  classAvoid: string;
}

let cached: MapTheme | null = null;

export function getMapTheme(): MapTheme {
  if (cached) return cached;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string): string => {
    const value = styles.getPropertyValue(name).trim();
    if (!value) throw new Error(`Missing CSS token ${name}; is tokens.css loaded?`);
    return value;
  };
  cached = {
    bg: read("--bg"),
    line: read("--line"),
    lineStrong: read("--line-strong"),
    text: read("--text"),
    muted: read("--text-muted"),
    accent: read("--accent"),
    cyan: read("--cyan"),
    hazard: read("--hazard"),
    classOk: read("--ok"),
    classCaution: read("--amber"),
    classAvoid: read("--hazard"),
  };
  return cached;
}

export const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
