# Assets and third-party material

Every font, icon set, library, image, tile source and data layer used by the app, with its license and where it is used. Update this file whenever something is added. If a license is unclear, do not use the asset.

## Fonts (self-hosted, no third-party requests at runtime)

| Font | Weights | Source | License | Used for |
|------|---------|--------|---------|----------|
| Inter (variable, `opsz` axis) | 100 to 900 (Latin subset, one woff2 file) | https://github.com/rsms/inter, file taken from the `@fontsource-variable/inter@5.3.0` npm package | SIL Open Font License 1.1 (`frontend/public/fonts/OFL-Inter.txt`, `landing/public/fonts/OFL-Inter.txt`) | Everything, in both the landing page and the planner (`--font-sans`, also used for numbers with tabular figures) |

The same file lives in `frontend/public/fonts/` and `landing/public/fonts/`. The fontsource package was used only to download it; it is not a project dependency. Fallback stack is in `frontend/src/styles/tokens.css`. Space Grotesk and IBM Plex Mono were used by earlier versions of the planner and are no longer shipped.

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

## Logo and favicon

| File | What | Source | License | Where used |
|------|------|--------|---------|------------|
| `docs/brand/ares-orbital-planet-logo.png` (1536 x 1024) | ARES logo: a glowing planet with a ring, mint and violet | Supplied by the team (file "ARES Orbital Planet Logo.png"). **Origin and tool not recorded; it looks AI-generated, so the team must confirm the tool and its terms and disclose it with the other AI visuals** | Unknown, to be confirmed | Source file for the derived icons below |
| `landing/public/` and `frontend/public/`: `favicon-32.png`, `favicon.ico` (16, 32, 48), `apple-touch-icon.png` (180), `ares-logo-512.png` | The planet cropped to a square on a near-black background and resized | Derived from the logo above (Pillow) | As the logo | Browser tab icon of the landing page and of the planner |

## Icons

Hand-drawn 16px stroke icons, authored for this project as inline SVG paths in `frontend/src/components/Icon.tsx` (same license as the repository). The favicon is an inline SVG data URI in `frontend/index.html`, also project-authored. No third-party icon set.

## Images

### Planner (`frontend/`)

None are shipped. The planner contains no photographs, no AI-generated images and no NASA logos, seals or insignia.

The stop card has a slot for a rover image (alt text and credit line). Images come from the API per stop (`stops[].image`); only `http(s)` URLs are accepted. Each image source must be listed here once the backend provides them.

The concept images used as visual direction (`ref-dashboard`, `ref-terminal`, `ref-hud`, `ref-tablet`) are AI-generated. They are not part of the app and none of their textures or invented values (mission ID, dates, sol, temperatures, route numbers) are used.

### Landing page (`landing/`): AI-generated media

Both files are **AI-generated** stylised illustrations of a ringed planet and satellites. They contain no people, no NASA logos or insignia and no real mission imagery.

| File | What | Original source | Tool | Date | License | Where used |
|------|------|-----------------|------|------|---------|------------|
| `landing/public/media/sky-poster.png` (1536 x 1024) | Poster still of the hero background | Downloaded from `d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0bf7409c-9fa2-4bef-a49d-34903dcc91ad.png`, as referenced by the team's `Arthurmyn/space-website` repository | **Not recorded in the repository.** The hosting pattern matches the Higgsfield service used earlier by the team; confirm | Hosted copy dated 26 Sep 2026 (HTTP `Last-Modified`) | **Unknown. The team must confirm the generating account's terms before submission** | Video poster and fallback |
| `landing/public/media/sky.mp4` (1664 x 1248, 9 s loop, no audio) | Looping hero background | Same host, `.../4b73c700-3112-4c07-bd48-0af2893dff7c.mp4` | As above | Hosted copy dated 26 Sep 2026 | **Unknown** | Hero background video |

Processing: the video was re-encoded (H.264, CRF 23, audio removed); the picture itself is unchanged. They are served from the site itself instead of being hotlinked.

### Landing page (`landing/`): demo video

| File | What | Source | License | Where used |
|------|------|--------|---------|------------|
| `landing/public/media/demo.mp4` (1440 x 900, about 63 s, no audio) and `demo-poster.jpg` | Screen recording of the planner in its sample-data build, with a cursor overlay | Recorded by the team's tooling from this repository (headless Chrome, Playwright), re-encoded to H.264. No third-party content | Same as the repository (MIT) | "See the planner work" section, opened by the "Get a demo" button |

It shows the "Sample data" badge because the planner ran on synthetic data. Re-record it when the planner uses real terrain data.

**Disclosure.** At the team's request (14 Nov 2026) the on-image "AI-generated" label and the corner badge were removed. The disclosure is now a sentence in the landing footer: "The background artwork on this page (video and still) is AI-generated." If the competition requires a mark on the media itself, add the label back before submission (the earlier version burned it into the poster and every video frame with Pillow and ffmpeg `drawtext`; see git history of this file, commit `c5c7e3f`).

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
