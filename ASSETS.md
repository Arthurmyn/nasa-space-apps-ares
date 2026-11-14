# Assets and third-party material

Every font, icon set, library, image, tile source and data layer used by the app, with its license and where it is used. Update this file whenever something is added. If a license is unclear, do not use the asset.

## Fonts (self-hosted, no third-party requests at runtime)

| Font | Weights | Source | License | Used for |
|------|---------|--------|---------|----------|
| Space Grotesk | 400, 500, 600, 700 (Latin subset, woff2) | https://github.com/floriankarsten/space-grotesk, files taken from the `@fontsource/space-grotesk@5.3.0` npm package | SIL Open Font License 1.1 (`frontend/public/fonts/OFL-Space-Grotesk.txt`) | Headings, labels, body text (`--font-sans`) |
| IBM Plex Mono | 400, 500, 600 (Latin subset, woff2) | https://github.com/IBM/plex, files taken from the `@fontsource/ibm-plex-mono@5.3.0` npm package | SIL Open Font License 1.1 (`frontend/public/fonts/OFL-IBM-Plex-Mono.txt`) | Numbers, coordinates, distances (`--font-mono`) |

| Inter (variable, `opsz` axis) | 100 to 900 (Latin subset, woff2) | https://github.com/rsms/inter, file taken from the `@fontsource-variable/inter@5.3.0` npm package | SIL Open Font License 1.1 (`landing/public/fonts/OFL-Inter.txt`) | Landing page (`landing/`) |

Planner fonts live in `frontend/public/fonts/`, the landing font in `landing/public/fonts/`. The fontsource packages were used only to download the files; they are not project dependencies. Fallback stacks are in `frontend/src/styles/tokens.css`.

## Libraries

| Library | Version | License | Where used |
|---------|---------|---------|------------|
| maplibre-gl | 6.18.0 | BSD-3-Clause | Map rendering, `frontend/src/map/` (loaded lazily). Its CSS is bundled with the map chunk. |
| react, react-dom | 18.3.1 | MIT | UI |
| vite, @vitejs/plugin-react | 5.4.11, 4.3.4 | MIT | Build and dev server |
| typescript | 5.6.3 | Apache-2.0 | Type checking (dev) |
| @types/react, @types/react-dom | 18.3.12, 18.3.1 | MIT | Types (dev) |
| @types/node | 22.20.5 | MIT | Types for the built-in `node:test` runner used by unit tests (dev only, never shipped) |
| react, react-dom | 19.x | MIT | Landing page project (`landing/`); the current page is static HTML and does not load them in the browser |
| vite, @vitejs/plugin-react, @tailwindcss/vite, tailwindcss | 8.x, 6.x, 4.x, 4.x | MIT | Landing build (`landing/`) |
| typescript | 7.x | Apache-2.0 | Landing type check (dev) |

Unit tests use Node's built-in test runner (`npm test`); no test framework was added.

## Icons

Hand-drawn 16px stroke icons, authored for this project as inline SVG paths in `frontend/src/components/Icon.tsx` (same license as the repository). The favicon is an inline SVG data URI in `frontend/index.html`, also project-authored. No third-party icon set.

## Images

### Planner (`frontend/`)

None are shipped. The planner contains no photographs, no AI-generated images and no NASA logos, seals or insignia.

The stop card has a slot for a rover image (alt text and credit line). Images come from the API per stop (`stops[].image`); only `http(s)` URLs are accepted. Each image source must be listed here once the backend provides them.

The concept images used as visual direction (`ref-dashboard`, `ref-terminal`, `ref-hud`, `ref-tablet`) are AI-generated. They are not part of the app and none of their textures or invented values (mission ID, dates, sol, temperatures, route numbers) are used.

### Landing page (`landing/`): AI-generated media

Both files are **AI-generated** and carry a visible "AI-generated" label burned into the picture (poster, and every frame of the video). They contain no people, no NASA logos or insignia, and no real mission imagery: they are stylised illustrations of a ringed planet and satellites.

| File | What | Original source | Tool | Date | License | Where used |
|------|------|-----------------|------|------|---------|------------|
| `landing/public/media/sky-poster.png` (1536 x 1024) | Poster still of the hero background | Downloaded from `d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0bf7409c-9fa2-4bef-a49d-34903dcc91ad.png`, as referenced by the team's `Arthurmyn/space-website` repository | **Not recorded in the repository.** The hosting pattern matches the Higgsfield service used earlier by the team; confirm | Hosted copy dated 26 Sep 2026 (HTTP `Last-Modified`). Label added 14 Nov 2026 | **Unknown. The team must confirm the generating account's terms before submission** | Video poster and fallback |
| `landing/public/media/sky.mp4` (1664 x 1248, 9 s loop, no audio) | Looping hero background | Same host, `.../4b73c700-3112-4c07-bd48-0af2893dff7c.mp4` | As above | Hosted copy dated 26 Sep 2026. Label added 14 Nov 2026 | **Unknown** | Hero background video |

Processing: the label ("AI-generated", white on a dark plate, bottom centre) was drawn onto the poster with Pillow and onto the video with ffmpeg `drawtext`, and the video was re-encoded (H.264, CRF 23, audio removed). The unlabelled originals are not kept in the repository. They were hotlinked from third-party hosting before; they are now served from the site itself.

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
