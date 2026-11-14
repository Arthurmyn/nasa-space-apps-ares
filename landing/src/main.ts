import "./styles.css";

/**
 * Hero artwork: topographic contour lines with a dashed route and three stops.
 * Generated from smooth noise, so it needs no image asset and stays sharp at any size.
 */
const SVG_NS = "http://www.w3.org/2000/svg";
const W = 1600;
const H = 900;

function height(x: number, y: number): number {
  // Sum of a few sines: smooth, deterministic, hill-like.
  return (
    Math.sin(x * 0.0042 + 1.2) * Math.cos(y * 0.0051) +
    0.6 * Math.sin((x + y) * 0.0078 + 0.5) +
    0.35 * Math.sin(x * 0.0125 - y * 0.0091 + 2.1)
  );
}

/** Marching squares over `height`, returning one path string per contour level. */
function contourPaths(levels: number[], step = 16): string[] {
  const cols = Math.ceil(W / step) + 1;
  const rows = Math.ceil(H / step) + 1;
  const grid: number[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < cols; c += 1) row.push(height(c * step, r * step));
    grid.push(row);
  }

  const lerp = (a: number, b: number, level: number) => (b === a ? 0.5 : (level - a) / (b - a));

  return levels.map((level) => {
    let d = "";
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < cols - 1; c += 1) {
        const tl = grid[r]?.[c] ?? 0;
        const tr = grid[r]?.[c + 1] ?? 0;
        const br = grid[r + 1]?.[c + 1] ?? 0;
        const bl = grid[r + 1]?.[c] ?? 0;
        const x = c * step;
        const y = r * step;
        // Edge crossings: top, right, bottom, left.
        const pts: Array<[number, number]> = [];
        if (tl < level !== tr < level) pts.push([x + lerp(tl, tr, level) * step, y]);
        if (tr < level !== br < level) pts.push([x + step, y + lerp(tr, br, level) * step]);
        if (bl < level !== br < level) pts.push([x + lerp(bl, br, level) * step, y + step]);
        if (tl < level !== bl < level) pts.push([x, y + lerp(tl, bl, level) * step]);
        if (pts.length === 2 || pts.length === 4) {
          for (let i = 0; i + 1 < pts.length; i += 2) {
            const a = pts[i];
            const b = pts[i + 1];
            if (a && b) d += `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
          }
        }
      }
    }
    return d;
  });
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function drawHeroArt(svg: SVGSVGElement): void {
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");

  const levels = Array.from({ length: 16 }, (_, i) => -1.6 + i * 0.22);
  contourPaths(levels).forEach((d, i) => {
    const major = i % 4 === 0;
    svg.appendChild(el("path", { d, fill: "none", stroke: "#fff", "stroke-opacity": major ? "0.3" : "0.14", "stroke-width": major ? "1.4" : "1" }));
  });

  // A route that wanders between three stops.
  const route = "M1010 610 C 1090 600, 1110 470, 1200 440 S 1330 520, 1400 400 S 1470 280, 1510 230";
  svg.appendChild(el("path", { d: route, fill: "none", stroke: "#fff", "stroke-width": "3", "stroke-dasharray": "10 8", "stroke-linecap": "round", "stroke-opacity": "0.85" }));
  const stops: Array<[string, number, number]> = [["S", 1010, 610], ["A", 1200, 440], ["B", 1510, 230]];
  for (const [label, x, y] of stops) {
    svg.appendChild(el("circle", { cx: String(x), cy: String(y), r: "16", fill: label === "S" ? "#2a0d04" : "#fff", stroke: "#fff", "stroke-width": "2" }));
    const t = el("text", { x: String(x), y: String(y + 1), "text-anchor": "middle", "dominant-baseline": "central", fill: label === "S" ? "#fff" : "#2a0d04", "font-family": "IBM Plex Mono, monospace", "font-size": "15", "font-weight": "600" });
    t.textContent = label;
    svg.appendChild(t);
  }
}

const art = document.getElementById("hero-art");
if (art instanceof SVGSVGElement) drawHeroArt(art);

/** Mark the nav link of the section in view. */
const links = new Map<string, HTMLAnchorElement>();
document.querySelectorAll<HTMLAnchorElement>(".nav__links a").forEach((a) => links.set(a.hash.slice(1), a));
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((a, id) => {
        if (id === entry.target.id) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }
  },
  { rootMargin: "-45% 0px -50% 0px" },
);
document.querySelectorAll("main section[id]").forEach((s) => observer.observe(s));
