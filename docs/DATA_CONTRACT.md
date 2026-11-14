# ARES: data contract v1 (Gale boxwork)

This file is shared by data, backend and frontend. Change it only together (one PR, all three review it).
It lives at `docs/DATA_CONTRACT.md`.

## 1. Principle
- One grid of elevation and slope per site, north up, square cells in metres.
- One script, `scripts/make_slope_grid.py`, builds the grid. The backend only reads the finished files.
- Real data and test (fake) data have the **same format**. Swapping means replacing files; the code does not change.

## 2. Where the files are
Each site has its own folder, `backend/data/<site_id>/` and `frontend/public/data/<site_id>/`, with the files below. The backend loads every folder under `backend/data/` that has a `meta.json` at startup; the folder name must equal `site_id` in its `meta.json`. `gale-bx` is the default site. A frontend site inventory (`SITE_GRID_IMAGES` in `frontend/src/config/tiles.ts`) lists the layer images of each site. The slope grid script takes the site from the handoff (`site_id`, `site_name`; `scripts/make_slope_grid.py --handoff <file>`), and `scripts/make_site_handoff.py` writes a handoff for a DTM that has no rover positions.
```
backend/data/gale-bx/
  meta.json        grid description (see section 3)
  elevation.bin    elevations, Float32, little-endian, row-major, metres
  slope.bin        slopes, Uint8, row-major
  stops.json       targets for the selection list (section 5)
  assumptions.json assumptions and sources (section 6)
  sources.json     registry of target sources: { "source_id": "description and link" }
  thermal.json     copy of the thermal layer description (section 2b); without it the layer is unavailable
frontend/public/data/gale-bx/
  meta.json        copy (the script copies it itself)
  elevation.bin    copy of the backend file (the script copies it itself); the HUD draws the 3D terrain from it
  hillshade.png    grey terrain background, RGBA, size width x height
  slope.png        coloured slope layer, RGBA with transparency, size width x height
  thermal.png      THEMIS thermal layer, RGBA, size width x height, bbox from meta.json (section 2b)
  thermal.json     thermal layer description: source, pixel size, value range, colours
```
Size: all files together up to 3,000,000 bytes. Of these, 100,000 bytes are reserved for the companion JSON files: the grid itself (meta.json ×2, elevation.bin ×2, slope.bin, hillshade.png, slope.png) must take no more than 2,900,000 bytes. If either limit is exceeded, the script uses a 2 m cell (`--cell 2`); if a limit is still exceeded, it exits with an error before writing.
### 2b. Thermal layer (THEMIS)
Made by `scripts/make_thermal_layer.py` from the USGS Astropedia cube "Gale Crater THEMIS Daytime IR ISIS" (link and credit in `ASSETS.md` and in `thermal.json`). It is a **single observation** by Mars Odyssey THEMIS (product `I24545011RDR`, band 9, 12.57 µm), with a native pixel of 100 m; about 70 pixels fall on the site. Values are stored as stretched 8-bit numbers, not calibrated temperature. A pixel with value 0 (the THEMIS team's ignore value) is transparent.
- `thermal.png`: each pixel of the site grid takes the value of the nearest THEMIS pixel (no interpolation), coloured by the scale in `thermal.json`.
- `thermal.json` (`schema: "ares.thermal/v1"`): `source` (title, URL, credit, license, product_id, observation time, sha256 of the cube), `native_pixel_m`, `value.site_dn_min/max`, `colormap.stops`, `bbox` (equal to the bbox in `meta.json`), `notes`. A copy lives in `backend/data/` and in `frontend/public/data/`.
- The backend treats the `thermal` layer as available only if `thermal.json` exists, its schema is correct, and `site_id` and `bbox` match `meta.json`. Otherwise the layer stays "No data for this site".
- Radiation is not a layer but one number for the whole site: `GET /layers` returns `radiation` as `available: false` with the reason "Single value for the whole site, see route summary". The number (0.67 mSv/day) and reference [5] are in `assumptions.json` (`Radiation dose rate`) and in `frontend/src/config/radiation.ts`.
- Geology: no published GIS boundaries of geologic units were found for the site, so the `geology` layer stays "No data for this site". Target notes contain only verified waypoint data (sol and coordinates).

In production the frontend serves `frontend/public/data/...` at `/app/data/gale-bx/...`.
The backend reads `backend/data/` (inside its own folder: the backend Docker image copies only `backend/`).

## 3. meta.json
```json
{
  "schema": "ares.grid/v1",
  "site_id": "gale-bx",
  "name": "Gale crater: boxwork (Mount Sharp)",
  "preliminary": true,
  "dtm_product_id": "DTEEC_009149_1750_009294_1750_U01",
  "is_test_data": false,
  "width": 650,
  "height": 830,
  "cell_m": 1.0,
  "mars_radius_m": 3396190,
  "center": { "lon": 137.3827764, "lat": -4.803166845 },
  "bbox": { "lon_min": 137.3774, "lon_max": 137.3881, "lat_min": -4.8104, "lat_max": -4.7959 },
  "x_min_m": -325.0,
  "y_max_m": 415.0,
  "elevation_nodata": "NaN",
  "slope_unit_deg": 0.5,
  "slope_nodata": 255,
  "slope_window_m": 5,
  "sources": ["HiRISE DTM DTEEC_009149_1750_009294_1750_U01, NASA/JPL/University of Arizona"]
}
```
If `is_test_data` is true, the frontend shows a "Test data" badge.

## 4. How to read the grid
The projection is local and equidistant: `x = R * radians(lon - lon0) * cos(radians(lat0))`, `y = R * radians(lat - lat0)`, where R = `mars_radius_m`, and lon0 and lat0 = `center`.
- Column: `col = (x - x_min_m) / cell_m`
- Row: `row = (y_max_m - y) / cell_m` (row 0 = north)
- Index in the file: `i = row * width + col`
- Size: `elevation.bin` = width*height*4 bytes, `slope.bin` = width*height bytes.
- Slope in degrees = `slope.bin[i] * slope_unit_deg`. The value 255 = no data.
- Slope is computed over a window of about `slope_window_m` metres (it smooths the noise of the 1 m DTM).
- PNG corners: the same `bbox` in degrees (north-west, north-east, south-east, south-west).

## 5. stops.json (targets for the selection list)
```json
{
  "groups": [
    { "id": "boxwork", "name": "Boxwork", "stop_ids": ["bx-1", "bx-2", "bx-3"] }
  ],
  "stops": [
    {
      "id": "bx-1", "name": "Boxwork ridge A", "lon": 137.381, "lat": -4.801,
      "note": "Short science note.",
      "image": null,
      "source_id": "src-hirise"
    }
  ]
}
```
`image` is either null or `{ "url": "...", "alt": "...", "credit": "..." }` (like `StopImage` in `frontend/src/api/types.ts`). `url` is an http(s) URL or a path on the same site, for example `/app/stops/sol4534-navcam-left.jpg` (files in `frontend/public/stops/`; every image needs its entry in `ASSETS.md`). The frontend drops any other scheme.
Target coordinates are inside the `bbox`. A group is what a person picks in the list ("Boxwork" and so on).
`context` (optional, top level of `stops.json`): a short "Why this site" text of 2-4 sentences with its sources, `{ "title", "text", "sources": [ { "title", "url", "credit" } ] }`. Only facts from the pages listed in `sources`; we do not attach science claims to individual targets, and the targets stay plain waypoints. Every source must be in the list in `frontend/src/config/references.ts` (the card prints it as [6]). The API returns `context` inside `GET /sites`, and the UI shows it under the list of stops and on the card.
`source_id` is resolved through `backend/data/gale-bx/sources.json` (an object: ID → a string with a description and a link). The generator adds to `meta.sources` only the sources of the current targets, as `"ID: description"` strings; when targets are replaced, the data changes, not the generator code. Without `stops.json` the registry is not needed. The shapes of `stops.json` and `meta.json` stay the same.

## 6. assumptions.json
```json
{
  "slope_limit_deg": 15,
  "slope_caution_deg": 10,
  "speed_kmh": 2,
  "items": [
    { "name": "Max slope", "value": "15 deg", "source": "TO VERIFY: document name" },
    { "name": "Walking speed", "value": "2 km/h", "source": "TO VERIFY: document name" }
  ]
}
```
The `items` field goes into the route response as `assumptions` (the shape of `Assumption` in `types.ts`).
We state the source explicitly and refer to a numbered document `[n]`; the list of documents is in `frontend/src/config/references.ts` (the route card prints it). If a source is not verified yet, we write `TO VERIFY` and the frontend shows an "Unverified" label.

## 7. API (backend)
The base path is `/api/v1`. The response shapes are already described in `docs/api.md` (the Frontend proposal section) and in `frontend/src/api/types.ts`. Do not change them.
- `GET /api/v1/layers?site_id=<id>` (default `gale-bx`, unknown id `404`): the `slope` and `optical` (hillshade) layers are always available; `thermal` is available if a valid `thermal.json` exists (section 2b); `radiation` is unavailable with the reason "Single value for the whole site, see route summary"; the others are `available: false` with the reason "No data for this site".
- `GET /api/v1/sites`: every loaded site, the default first: `{ "sites": [ { "id", "name", "groups": [...], "stops": [...] } ] }` from `meta.json` and `stops.json` (a new endpoint, the frontend needs it for the selection list).
- `POST /api/v1/route` (optional `site_id` in the body, default `gale-bx`, unknown id `404`): A* over `slope.bin`, 8 neighbours. A cell with a slope above `slope_limit_deg` is impassable. The cost of a step = length * (1 + (slope/limit)^2). Stops in order: start, stop-1, stop-2, ...
  - If there is no path: HTTP 422 and `{ "detail": "<a clear reason, which leg and why>" }`.
  - `profile` is taken along the route from `elevation.bin` and `slope.bin`.
  - `est_time_s = distance_m / (speed_kmh / 3.6)`.
  - `safety`: `ok` if the max slope is not above `slope_caution_deg`; `caution` up to `slope_limit_deg`; otherwise `avoid`.

## 8. Test data
`scripts/make_fake_grid.py` creates a grid in the **same format** (an inclined plane, two hills and a ravine) with `is_test_data: true`. This way the backend and the frontend work in parallel until the real DTM is available.
