# Assets and third-party material

Every font, icon set, library, image, tile source and data layer used by the app, with its license and where it is used. Update this file whenever something is added. If a license is unclear, do not use the asset.

## Fonts (self-hosted, no third-party requests at runtime)

| Font | Weights | Source | License | Used for |
|------|---------|--------|---------|----------|
| Space Grotesk | 400, 500, 600, 700 (Latin subset, woff2) | https://github.com/floriankarsten/space-grotesk, files taken from the `@fontsource/space-grotesk@5.3.0` npm package | SIL Open Font License 1.1 (`frontend/public/fonts/OFL-Space-Grotesk.txt`) | Headings, labels, body text (`--font-sans`) |
| IBM Plex Mono | 400, 500, 600 (Latin subset, woff2) | https://github.com/IBM/plex, files taken from the `@fontsource/ibm-plex-mono@5.3.0` npm package | SIL Open Font License 1.1 (`frontend/public/fonts/OFL-IBM-Plex-Mono.txt`) | Numbers, coordinates, distances (`--font-mono`) |

Files live in `frontend/public/fonts/`; the landing page (`landing/public/fonts/`) uses a copy of the same files (Space Grotesk 400 to 700, IBM Plex Mono 400 and 500). The fontsource packages were used only to download the files; they are not project dependencies. Fallback stacks are in `frontend/src/styles/tokens.css`.

## Libraries

| Library | Version | License | Where used |
|---------|---------|---------|------------|
| maplibre-gl | 6.18.0 | BSD-3-Clause | Map rendering, `frontend/src/map/` (loaded lazily). Its CSS is bundled with the map chunk. |
| react, react-dom | 18.3.1 | MIT | UI |
| vite, @vitejs/plugin-react | 5.4.11, 4.3.4 | MIT | Build and dev server |
| typescript | 5.6.3 | Apache-2.0 | Type checking (dev) |
| @types/react, @types/react-dom | 18.3.12, 18.3.1 | MIT | Types (dev) |
| @types/node | 22.20.5 | MIT | Types for the built-in `node:test` runner used by unit tests (dev only, never shipped) |

Unit tests use Node's built-in test runner (`npm test`); no test framework was added.

## Landing page (`landing/`)

- No images. The hero is an inline SVG (topographic contour lines, a dashed route and three stops) generated at runtime from a sine-based height function in `landing/src/main.ts`. Project-authored.
- No third-party requests at runtime: no Google Fonts, no CDN scripts, no analytics.
- Runtime dependencies: none. Build tools only (`vite`, `typescript`, same versions as the planner).
- Text content is drawn from `docs/` (research notes and the system specification). Links in its footer point to the sources listed there.
- Not used, on purpose: the AI-generated images that the earlier "Redline" concept (github.com/Arthurmyn/Nasa-mars) loaded from images.higgs.ai. They are third-party hosted and AI-generated; if they are added later, the license and the AI disclosure must be recorded here.

## Icons

Hand-drawn 16px stroke icons, authored for this project as inline SVG paths in `frontend/src/components/Icon.tsx` (same license as the repository). The favicon is an inline SVG data URI in `frontend/index.html`, also project-authored. No third-party icon set.

## Images

None are shipped. The app contains no photographs, no AI-generated images and no NASA logos, seals or insignia.

The stop card has a slot for a rover image (alt text and credit line). Images come from the API per stop (`stops[].image`); only `http(s)` URLs are accepted. Each image source must be listed here once the backend provides them.

The concept images used as visual direction (`ref-dashboard`, `ref-terminal`, `ref-hud`, `ref-tablet`) are AI-generated. They are not part of the app and none of their textures or invented values (mission ID, dates, sol, temperatures, route numbers) are used.

## Tile sources

None configured. `frontend/src/config/tiles.ts` holds one empty entry per layer (`url: null`).

TODO(team): when a tile source is chosen, add a row here with URL, license, attribution text and layer.

| Layer | URL | License | Attribution |
|-------|-----|---------|-------------|
| (none yet) | | | |

## Data layers

The app itself ships no scientific data. Layers (slope, optical, thermal, geology, radiation) are reported by the backend (`GET /layers`) and drawn from tiles in `tiles.ts`.

With `VITE_USE_MOCK=true` the app uses synthetic sample data from `frontend/src/api/mock.ts` (a sine-wave terrain and generated hazards). It is not real Martian data and the UI labels it "Sample data".

## Constants

| Constant | Value | Source | Where |
|----------|-------|--------|-------|
| Mars mean radius | 3389.5 km | IAU Working Group on Cartographic Coordinates and Rotational Elements (WGCCRE) reports | `frontend/src/lib/geo.ts`: scale bar, grid spacing, distances |

Slope thresholds (`SLOPE_LIMITS` in `frontend/src/config/route.ts`) are placeholders, not sourced values. See "Placeholders" in `frontend/README.md`.
