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
  slope.png        coloured slope layer, RGBA with transparency, size width x height;
                   classes <=10 / 10-15 / 15-20 / >20 deg (lunar analogs, 10 deg is a display break only)
  slope.bin        copy of backend slope.bin; the browser refuses a stop on a gap or over the limit
  thermal.png      THEMIS thermal layer, RGBA, size width x height, bbox from meta.json (section 2b)
  thermal.json     thermal layer description: source, pixel size, value range, colours
```
Size: all files together up to 3,000,000 bytes. Of these, 100,000 bytes are reserved for the companion JSON files: the grid itself (meta.json ×2, elevation.bin, slope.bin ×2, hillshade.png, slope.png) must take no more than 2,900,000 bytes. The frontend copy of `elevation.bin` for the HUD is identical to the backend file and is not counted in either limit (like the optical image). If either limit is exceeded, the script tries a 2 m cell (`--cell 2`), then a 3 m cell (`--cell 3`); if a limit is still exceeded, it exits with an error before writing. The full team AOI (137.3762-137.3984 E, -4.8113 to -4.7802) fits only at 3 m.
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
  "slope_window_m": 6.0,
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
- Slope is computed over a window of `slope_window_m` metres. `scripts/make_slope_grid.py` first smooths the elevation with a box filter whose width is the odd number of cells nearest 5 m (5 cells at 1 m, 3 at 2 m, 1 at 3 m, which means no smoothing), then takes a central difference between the neighbouring cells. `slope_window_m` = (box width in cells + 1) x `cell_m`, the span between the centres of the outermost DTM cells used: 6 m at 1 m, 8 m at 2 m, 6 m at 3 m.
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
`context` (optional, top level of `stops.json`): a short "Why this site" text of 2-4 sentences with its sources, `{ "title", "text", "sources": [ { "title", "url", "credit" } ] }`. Only facts from the pages listed in `sources`; we do not attach science claims to individual targets, and the targets stay plain waypoints. Every source must be in the list in `frontend/src/config/references.ts` (the card prints its number from there). No shipped site has a `context` now. The API returns `context` inside `GET /sites`, and the UI shows it under the list of stops and on the card.
`source_id` is resolved through `backend/data/gale-bx/sources.json` (an object: ID → a string with a description and a link). The generator adds to `meta.sources` only the sources of the current targets, as `"ID: description"` strings; when targets are replaced, the data changes, not the generator code. Without `stops.json` the registry is not needed. The shapes of `stops.json` and `meta.json` stay the same.

## 6. assumptions.json
```json
{
  "slope_limit_deg": 15,
  "slope_caution_deg": 10,
  "speed_kmh": 2,
  "eva_limit_s": 28800,
  "items": [
    { "name": "Max slope", "value": "15 deg", "source": "TO VERIFY: document name" },
    { "name": "Walking speed", "value": "2 km/h", "source": "TO VERIFY: document name" }
  ]
}
```
`eva_limit_s` (optional) is the longest EVA in seconds. The route response uses it for `status`: a round trip longer than this is `NO-GO`. The value 8 h is marked TO VERIFY (item "EVA time limit"): the project notes list it, but it was not checked against its documents. Without the field, the rule is skipped.
The `items` field goes into the route response as `assumptions` (the shape of `Assumption` in `types.ts`).
We state the source explicitly and refer to a numbered document `[n]`; the list of documents is in `frontend/src/config/references.ts` (the route card prints it). If a source is not verified yet, we write `TO VERIFY` and the frontend shows an "Unverified" label.

## 7. API (backend)
The base path is `/api/v1`. The response shapes are already described in `docs/api.md` (the Frontend proposal section) and in `frontend/src/api/types.ts`. Do not change them.
- `GET /api/v1/layers?site_id=<id>` (default `gale-bx`, unknown id `404`): the `slope` and `optical` (hillshade) layers are always available; `thermal` is available if a valid `thermal.json` exists (section 2b); `radiation` is unavailable with the reason "Single value for the whole site, see route summary"; the others are `available: false` with the reason "No data for this site".
- `GET /api/v1/sites`: every loaded site, the default first: `{ "sites": [ { "id", "name", "groups": [...], "stops": [...] } ] }` from `meta.json` and `stops.json` (a new endpoint, the frontend needs it for the selection list).
- `POST /api/v1/route/sensitivity`: the same body, planned with hard limits 10, 15 and 20 degrees. `GET /api/v1/conditions`: Curiosity REMS weather, cached for an hour. See `docs/api.md`.
- `POST /api/v1/route` (optional `profile`: `fast`, `balanced` or `safe`, `site_id` in the body, default `gale-bx`, unknown id `404`): A* over `slope.bin`, 8 neighbours. A cell with a slope above `slope_limit_deg` is impassable. The cost of a step = length * (1 + (slope/limit)^2). Stops in order: start, stop-1, stop-2, ...
  - If there is no path: HTTP 422 and `{ "detail": "<a clear reason, which leg and why>" }`.
  - `profile` is taken along the route from `elevation.bin` and `slope.bin`.
  - `est_time_s = distance_m / (speed_kmh / 3.6)`.
  - `safety`: `ok` if the max slope is not above `slope_caution_deg`; `caution` up to `slope_limit_deg`; otherwise `avoid`.

## 8. Test data
`scripts/make_fake_grid.py` creates a grid in the **same format** (an inclined plane, two hills and a ravine) with `is_test_data: true`. This way the backend and the frontend work in parallel until the real DTM is available.

## 9. Mars overview markers (`sites_global.json`)
`frontend/public/data/sites_global.json` (served at `/app/data/sites_global.json`) lists the markers of the Mars overview, the first page of the web app. The frontend reads it at run time, so a data change needs no code change. It is not part of a site folder and not read by the backend.
```json
[
  {
    "id": "gale-bx", "name": "Gale crater: boxwork (Mount Sharp)", "type": "active",
    "lon": 137.3873, "lat": -4.79575,
    "note": "Short factual text.",
    "source": { "title": "Where the numbers come from", "url": "https://example.org/page" }
  }
]
```
- `type` is `active` (an ARES site), `landing` (a landing site of a mission) or `landmark` (a named feature). Anything else is dropped, and the loader logs each dropped entry with the reason.
- `lon` is degrees east, -180 to 180 (0 to 360 is accepted and shifted); `lat` is -90 to 90. For an `active` entry, `id` must be the `site_id` of a folder in `frontend/public/data/` and the point must lie on that site (a test checks both).
- `source` is a link (a string) or `{ "title", "url" }`. Only http(s) links are kept. Every entry needs a source, and every source needs a row in `ASSETS.md`. A value we could not verify is left out; the file never carries a guess.
- A marker of type `active` opens the planner on that site; the other types only show their note and "Terrain data not loaded yet".

## 10. Curiosity traverse (`msl_traverse.json`)
`frontend/public/data/msl_traverse.json` (served at `/app/data/msl_traverse.json`) is the whole drive of the Curiosity rover near the sites, drawn as the optional "Full drive path" overlay on the Plan map (a separate layer from the per-site `traverse.geojson` of waypoint stops, which has its own switch). `python -m scripts.fetch_traverse` makes it from the NASA/JPL MMGIS file `MSL_traverse.json` (`ASSETS.md` has the URL and terms status). It is fetched by the browser only when the overlay is switched on, and the backend does not read it.
- A GeoJSON `FeatureCollection` with one `MultiLineString` feature in `[lon, lat]` degrees (no elevations), plus an `ares` member: `schema: "ares.traverse/v1"`, `aoi_bbox` (the union of the site boxes), `clip_bbox` (the AOI plus `margin_deg`), `simplify_m` (Douglas-Peucker tolerance), `intersects_aoi`, `nearest_to_aoi` (`lon`, `lat`, `distance_m`), `source_vertices`, `kept_vertices`, and `source` (`title`, `url`, `fetched_utc`, `sha256` and `bytes` of the downloaded file).
- Every written vertex is a vertex of the source, rounded to 1e-6 degrees. If the drive never enters the clip window, the part nearest to the AOI is written instead and `intersects_aoi` is false; the file is still shipped. The app compares the file with the open site's `bbox`: when no vertex is inside it says so, gives the distance to the nearest one, and frames the map on the site and that vertex.
- The script exits with an error if the output would be over 150,000 bytes.

