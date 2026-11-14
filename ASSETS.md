# Assets and third-party material

Every font, icon set, library, image, tile source and data layer used by the app, with its license and where it is used. Update this file whenever something is added. If a license is unclear, do not use the asset.

The project itself is licensed under the Apache License 2.0 (`LICENSE`, `NOTICE`). The licenses below are those of third-party material.

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

Hand-drawn 16px stroke icons, authored for this project as inline SVG paths in `frontend/src/components/Icon.tsx` (same license as the repository (Apache-2.0)). The favicon is an inline SVG data URI in `frontend/index.html`, also project-authored. No third-party icon set.

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
| `landing/public/media/demo.mp4` (1440 x 900, about 63 s, no audio) and `demo-poster.jpg` | Screen recording of the planner in its sample-data build, with a cursor overlay | Recorded by the team's tooling from this repository (headless Chrome, Playwright), re-encoded to H.264. No third-party content | Same as the repository (Apache-2.0) | "See the planner work" section, opened by the "Get a demo" button |

It shows the "Sample data" badge because the planner ran on synthetic data. Re-record it when the planner uses real terrain data.

**Disclosure.** At the team's request (14 Nov 2026) the on-image "AI-generated" label and the corner badge were removed. The disclosure is now a sentence in the landing footer: "The background artwork on this page (video and still) is AI-generated." If the competition requires a mark on the media itself, add the label back before submission (the earlier version burned it into the poster and every video frame with Pillow and ffmpeg `drawtext`; see git history of this file, commit `c5c7e3f`).

## Tile sources

Configured in `frontend/src/config/tiles.ts`. Layers without a URL draw nothing and the layers panel says "Tiles not configured".

| Layer | URL | License | Attribution | Where used |
|-------|-----|---------|-------------|------------|
| optical | `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg` | NASA/JPL imagery. The NASA Images and Media Usage Guidelines (`https://www.nasa.gov/nasa-brand-center/images-and-media/`, read 15 Nov 2026) say: "NASA content - images, audio, video, and media files used in the rendition of 3-dimensional models, such as texture maps and polygon data in any format - generally are not subject to copyright in the United States. You may use this material for educational or informational purposes". Mars Trek publishes no terms page we could read (the portal is built by scripts; `/about`, `/mars/about` and `/mars/help` return 404), so Trek-specific terms were not found: TODO(team) confirm with JPL Mars Trek before submission | NASA/JPL, Mars Trek (Viking MDIM 2.1) | Map basemap (`optical` layer), `frontend/src/map/useRasterLayers.ts` |

Mars Trek optical basemap, as read from its WMTS GetCapabilities (`https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml`):

- Product: Viking MDIM 2.1 colour mosaic, global, 232 m/px. JPEG, 256 px tiles.
- Grid: EPSG:104905 (Mars equirectangular), matrix set `default028mm`, bbox -180 -90 180 90, origin top-left. Level 0 is 2 x 1 tiles, doubling per level, levels 0 to 7.
- URL order is `{level}/{row}/{col}`. Rows count from the top (XYZ-like, not TMS).
- This is not the Web Mercator grid MapLibre expects, so `frontend/src/map/equirectProtocol.ts` fetches the source tiles and reprojects them into Mercator tiles in the browser (math in `frontend/src/lib/equirect.ts`). MapLibre zoom 8 reads level 7; deeper zoom is overzoomed.
- Tiles outside coverage answer 404. The loader treats that as a transparent tile and shows no error. Other HTTP errors are reported.
- The server sends `Access-Control-Allow-Origin: *`, which the canvas reprojection needs.
- Our DTM-derived layers (slope, route, grid) are drawn above this basemap.

## Data layers

The app itself ships no scientific data. Layers (slope, optical, thermal, geology, radiation) are reported by the backend (`GET /layers`) and drawn from tiles in `tiles.ts`.

### Site grid (Gale boxwork)

Files in `frontend/public/data/gale-bx/` and `backend/data/gale-bx/`, made by `scripts/make_slope_grid.py` (format: `docs/DATA_CONTRACT.md`).

| Item | Source | License | Where used |
|------|--------|---------|------------|
| Terrain grid, `hillshade.png`, `slope.png`, `elevation.bin`, `slope.bin` | HiRISE DTM `DTEEC_009149_1750_009294_1750_U01`, NASA/JPL/University of Arizona. Download: `https://www.uahirise.org/PDS/DTM/PSP/ORB_009100_009199/PSP_009149_1750_PSP_009294_1750/DTEEC_009149_1750_009294_1750_U01.IMG`. The grid is derived from it (cell 2 m, slope window 5 m) | HiRISE Image Usage Policy (`https://uahirise.org/media/usage.php`, read 15 Nov 2026): "there is no copyright restriction. All of the images produced by HiRISE and accessible on this site are within the public domain: there are no restrictions on their usage by anyone in the public... We do ask for a credit line where possible: Image: NASA/JPL/University of Arizona". The policy speaks of images; the DTM is a HiRISE product on the same site and the policy does not name DTMs. Credit used in the app: NASA/JPL/University of Arizona | Slope and Optical layers (image sources on the site bbox), route planning |
| Science targets `bx-1` to `bx-6` | NASA/JPL Curiosity MSL waypoints, `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json`; snapshot `docs/research/r0/rover_sols4534-4805.geojson` | NASA/JPL data (MMGIS JSON). The NASA media guidelines quoted above cover media files, not this JSON, and no terms specific to the MMGIS files were found; the JPL image use policy (`https://www.jpl.nasa.gov/jpl-image-use-policy`) answered HTTP 403 and could not be read. Credit: NASA/JPL-Caltech. TODO(team) confirm | "Science targets" group list (`GET /sites`) |
| Thermal layer, `thermal.png` and `thermal.json` | Gale Crater THEMIS Daytime IR ISIS, USGS Astrogeology Science Center, from Mars Odyssey THEMIS (NASA/JPL-Caltech/Arizona State University). Page: `https://astrogeology.usgs.gov/search/map/gale_crater_themis_daytime_ir_isis`; file: `https://astrogeology.usgs.gov/ckan/dataset/0e7eae1a-a29c-4ea6-8eee-8ebce2deb079/resource/374f1c54-b81e-47ce-8b6f-f4b7daa40163/download/gale_crater_themis_dayir_isis.cub` (3,201,705 bytes, sha256 `8c256fe8e85ebec53c33fb9ea258efd7548b519439a468e54750caf617bdcd91`). Team page with the instructions (ignore value 0): `https://themis.mars.asu.edu/landingsites`. Converted by `scripts/make_thermal_layer.py` | THEMIS Citation Policy (`https://themis.asu.edu/terms`, read 15 Nov 2026): "For news media or educational purposes, please credit THEMIS images as: NASA/JPL-Caltech/Arizona State University."; for research, cite "Christensen, P.R., N.S. Gorelick, G.L. Mehall, and K.C. Murray, THEMIS Public Data Releases, Planetary Data System node, Arizona State University, http://themis-data.asu.edu". The USGS Astropedia page shows no license text of its own (an earlier note here, "public domain", was an assumption and has been removed) | Thermal layer (image source on the site bbox) and its legend |

The thermal data is a single THEMIS observation (product `I24545011RDR`, band 9 at 12.57 um, started 2007-06-27 08:41:52 UTC), pixel size 100 m, stretched 8-bit values 88 to 187 inside the site (about 70 THEMIS pixels), not calibrated temperature. NASA Mars Trek was checked first: its catalog endpoint (`https://api.nasa.gov/mars-wmts/catalog`) did not answer from the build machine (timeout), so no Trek THEMIS layer was used.

The layers panel shows a short credit ("HiRISE DTM (NASA/JPL/University of Arizona) + Mars Trek (NASA/JPL)"). The full list, with file paths, is in `meta.sources` and under "How this is computed".

With `VITE_USE_MOCK=true` the app uses synthetic sample data from `frontend/src/api/mock.ts` (a sine-wave terrain and generated hazards). It is not real Martian data and the UI labels it "Sample data".

## Referenced documents

Cited as [1] to [5] in the assumptions (and [6], the site context page, on the card) (`backend/data/gale-bx/assumptions.json`) and printed on the route card. They are links to public NASA and JPL pages, not files in this repository. Full list: `frontend/src/config/references.ts`.

1. NASA EVA-EXP-0075, Exploration EVA System ConOps for Artemis Phase 1: https://www.nasa.gov/wp-content/uploads/2020/01/topic_1-_eva_lunar_surface_concept_of_operations.pdf
2. NASA Moon to Mars Architecture 2024, Lunar Mobility Drivers and Needs: https://www.nasa.gov/wp-content/uploads/2024/06/acr24-lunar-mobility-drivers-and-needs.pdf
3. Apollo 11 Lunar Surface Journal, Lunar gaits: https://www.nasa.gov/wp-content/uploads/static/history/alsj/a11/a11.gaits.html
4. JPL PIA26017, Curiosity's difficult climb: https://www.jpl.nasa.gov/images/pia26017-a-map-of-curiositys-difficult-climb/
5. Hassler, D. M. et al., Mars' Surface Radiation Environment Measured with the Mars Science Laboratory's Curiosity Rover, Science 343 (6169), 1244797, online 9 Dec 2013, print 24 Jan 2014: https://doi.org/10.1126/science.1244797 (DOI and bibliographic data checked in Crossref). The figure of 0.67 mSv per day (average galactic cosmic ray dose equivalent rate on the Martian surface, August 2012 to June 2013) was checked in the SwRI release quoting the RAD principal investigator: https://www.swri.org/press-release/swri-scientists-publish-first-radiation-measurements-surface-mars. The paper itself was not read.
6. NASA/JPL, NASA's Curiosity Rover Sees Martian 'Spiderwebs' Up Close, 23 February 2026: https://nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-rover-sees-martian-spiderwebs-up-close
7. Design reference, no data used: NASA/JPL, Curiosity's Proposed Path up Mount Sharp (PIA23179), 15 May 2019, credit NASA/JPL-Caltech/ESA/University of Arizona/JHUAPL/MSSS/USGS Astrogeology Science Center: https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/ (page read on 15 November 2026: title, date and credit as quoted). It shows how NASA presents a route on Mount Sharp; the route styling of the planner follows that idea and nothing from the image is copied or shown. Listed in `frontend/src/config/references.ts` (flagged `design`), shown under "How this is computed" and not printed on the route card.

The values attributed to [1] to [4] (a 20 deg EVA walking capability, a 2 km distance limit, Apollo walking speeds, the 23 deg slope at Gale) were supplied by the team and not re-checked against the documents. There is no official human-on-Mars slope standard; the 15 deg and 10 deg limits are ARES planning values.

## Stop images

One Curiosity raw image per science stop `bx-1` to `bx-6`, chosen from the Navcam frames of the stop's own sol (the sol in the stop's name). They come from the NASA Curiosity raw images service (`https://mars.nasa.gov/msl/multimedia/raw-images/`, API `https://mars.nasa.gov/api/v1/raw_image_items/`). Every image was opened and looked at before it was chosen: each shows the terrain around the rover and the horizon. The files are copies served by this site, not hotlinks (`image.url` in `backend/data/gale-bx/stops.json` is `/app/stops/<file>`, `/app/` being the Vite `base`).

Processing: the original 1024 x 1024 greyscale JPEG was cropped to its top 860 rows (the bottom edge shows rover hardware in some frames), resized to 800 x 672 and saved as a progressive JPEG under 150 KB. Navcam raw images are greyscale. No other change was made.

| File | Source URL | Camera | Sol | Credit | License | Where used |
|------|------------|--------|-----|--------|---------|------------|
| `frontend/public/stops/sol4534-navcam-left.jpg` | `https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/04534/opgs/edr/ncam/NLB_800007896EDR_F1160000NCAM00280M_.JPG` (raw image page: `https://mars.nasa.gov/raw_images/1464397`, image id `NLB_800007896EDR_F1160000NCAM00280M_`) | Navcam Left B | 4534 (2025-05-08) | NASA/JPL-Caltech, Mars Science Laboratory, sol 4534, Navcam Left B | NASA media, free to use with credit | Stop card (`StopCard`), through `GET /sites` and `POST /route`; set in `stops.json` |
| `frontend/public/stops/sol4554-navcam-left.jpg` | `https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/04554/opgs/edr/ncam/NLB_801783552EDR_F1161806NCAM00258M_.JPG` (raw image page: `https://mars.nasa.gov/raw_images/1472522`, image id `NLB_801783552EDR_F1161806NCAM00258M_`) | Navcam Left B | 4554 (2025-05-29) | NASA/JPL-Caltech, Mars Science Laboratory, sol 4554, Navcam Left B | NASA media, free to use with credit | Stop card (`StopCard`), through `GET /sites` and `POST /route`; set in `stops.json` |
| `frontend/public/stops/sol4585-navcam-left.jpg` | `https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/04585/opgs/edr/ncam/NLB_804534112EDR_F1170702NCAM00286M_.JPG` (raw image page: `https://mars.nasa.gov/raw_images/1482860`, image id `NLB_804534112EDR_F1170702NCAM00286M_`) | Navcam Left B | 4585 (2025-06-30) | NASA/JPL-Caltech, Mars Science Laboratory, sol 4585, Navcam Left B | NASA media, free to use with credit | Stop card (`StopCard`), through `GET /sites` and `POST /route`; set in `stops.json` |
| `frontend/public/stops/sol4609-navcam-right.jpg` | `https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/04609/opgs/edr/ncam/NRB_806661584EDR_F1172730NCAM00267M_.JPG` (raw image page: `https://mars.nasa.gov/raw_images/1492545`, image id `NRB_806661584EDR_F1172730NCAM00267M_`) | Navcam Right B | 4609 (2025-07-24) | NASA/JPL-Caltech, Mars Science Laboratory, sol 4609, Navcam Right B | NASA media, free to use with credit | Stop card (`StopCard`), through `GET /sites` and `POST /route`; set in `stops.json` |
| `frontend/public/stops/sol4655-navcam-right.jpg` | `https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/04655/opgs/edr/ncam/NRB_810748798EDR_F1182538NCAM00277M_.JPG` (raw image page: `https://mars.nasa.gov/raw_images/1511515`, image id `NRB_810748798EDR_F1182538NCAM00277M_`) | Navcam Right B | 4655 (2025-09-10) | NASA/JPL-Caltech, Mars Science Laboratory, sol 4655, Navcam Right B | NASA media, free to use with credit | Stop card (`StopCard`), through `GET /sites` and `POST /route`; set in `stops.json` |
| `frontend/public/stops/sol4805-navcam-right.jpg` | `https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/04805/opgs/edr/ncam/NRB_824057254EDR_F1200808NCAM00280M_.JPG` (raw image page: `https://mars.nasa.gov/raw_images/1549538`, image id `NRB_824057254EDR_F1200808NCAM00280M_`) | Navcam Right B | 4805 (2026-02-11) | NASA/JPL-Caltech, Mars Science Laboratory, sol 4805, Navcam Right B | NASA media, free to use with credit | Stop card (`StopCard`), through `GET /sites` and `POST /route`; set in `stops.json` |

License: NASA content "generally [is] not subject to copyright in the United States" and may be used for educational or informational purposes, with credit (NASA Images and Media Usage Guidelines, `https://www.nasa.gov/nasa-brand-center/images-and-media/`, read on 15 November 2026). The credit line is shown under each image in the app. The image of a stop is a frame from the same sol; the rover may have moved during that sol, so it is context for the area, not a view from the exact waypoint. The stops are Curiosity waypoints, not confirmed science targets.

## Site context text

The "Why this site" text (Plan panel and route card, reference [6]) is stored in `backend/data/gale-bx/stops.json` under `context`. It uses only facts stated in one page, read in full:

- NASA/JPL, "NASA's Curiosity Rover Sees Martian 'Spiderwebs' Up Close", 23 February 2026, `https://nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-rover-sees-martian-spiderwebs-up-close`. Credit NASA/JPL-Caltech. Facts used: boxwork ridges roughly 1 to 2 m (3 to 6 ft) tall with sandy hollows, crisscrossing the surface for miles on Mount Sharp; the formations suggest ancient groundwater flowed on this part of Mars later than scientists expected; they look like giant spiderwebs from space.

The JPL news release `https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations/` is not cited and nothing in the app comes from it: a direct download returned HTTP 403, and a delegated fetch returned only a summary, not the page text, so its facts could not be checked here.

## Constants

| Constant | Value | Source | Where |
|----------|-------|--------|-------|
| Mars sphere radius | 3396.19 km (3,396,190 m) | `mars_radius_m` in `backend/data/gale-bx/meta.json`, from the PDS labels of the HiRISE DTM (sphere radius used by the product). The IAU mean radius, 3389.5 km, is 0.2% smaller and is no longer used | `frontend/src/lib/geo.ts`: scale bar, grid spacing, distances; the same value builds the grid (`scripts/make_slope_grid.py`) and the route lengths of the API |
| GCR dose equivalent rate at the Gale surface | 0.67 mSv per day (August 2012 to June 2013) | Reference [5], Curiosity RAD; checked in the SwRI release | `frontend/src/config/radiation.ts`: estimated dose in the route summary and on the card |

Slope thresholds (`SLOPE_LIMITS` in `frontend/src/config/route.ts`) are ARES planning values equal to `assumptions.json`; the sources and the lunar-versus-Mars caveat are listed under "Referenced documents".
