# API contract

Base URL: `http://localhost:8000/api/v1` · Interactive docs: `/docs` (Swagger).

The source of truth is the Pydantic schemas in [`backend/app/schemas/`](../backend/app/schemas/). This file is the human-readable version for the frontend.

## `GET /health`
```json
{ "status": "ok", "data_loaded": true }
```

`data_loaded` shows whether the grid was loaded at startup. Without the data files, health stays available, while `/layers`, `/sites` and `/route` return `503` with a clear `detail`. The ML stub `/predict` was removed.

---

### How to change the contract
1. Update the schema in `backend/app/schemas/`.
2. Update this file and the types in `frontend/src/api/client.ts`.
3. Do it all in one PR and request both frontend and backend reviewers.

---

## Frontend proposal: route planning (ARES UI)

> **Status: implemented in the backend.** The response shapes below match [`frontend/src/api/types.ts`](../frontend/src/api/types.ts) and the runtime validators in [`validate.ts`](../frontend/src/api/validate.ts).
>
> `VITE_USE_MOCK=true` enables frontend-only mock responses. The backend reads the committed real terrain from `backend/data/gale-bx/`; the frontend metadata and rasters match that grid.

Conventions: coordinates are `[lon, lat]` in degrees on Mars, longitude east-positive in -180..180 (GeoJSON order). Distances in metres, slopes in degrees, times in seconds. All numbers on screen come from these responses; the UI has no hardcoded metrics.

### `GET /layers`

Which data layers exist for a site. `?site_id=<id>` picks the site (default `gale-bx`, so older clients keep working); an unknown id is `404` with a `detail`. An explicit `available: false` is authoritative and disables the layer with its `reason`. When the API has no entry, the UI may fall back to configured global tiles or a site-specific inventory of bundled images. Unknown sites never inherit another site's terrain PNGs.

```json
{
  "layers": [
    { "id": "slope",   "available": true,  "reason": null, "source": "Dataset name, provider" },
    { "id": "thermal", "available": false, "reason": "No data for this site", "source": null }
  ]
}
```

| Field | Type | Notes |
|-------|------|-------|
| `layers[].id` | `"slope" \| "optical" \| "thermal" \| "geology" \| "radiation"` | Unknown ids make the whole response invalid |
| `layers[].available` | boolean | |
| `layers[].reason` | string \| null | Shown when not available. Default text: "No data for this site"; `radiation` says "Single value for the whole site, see route summary" |
| `layers[].source` | string \| null | Dataset and provider, shown in the layer legend. `thermal` is available when `backend/data/<site>/thermal.json` exists and matches the site's `meta.json` (`docs/DATA_CONTRACT.md`, 2b) |

Layer imagery itself is not served by the API. Grid images are in `frontend/public/data/gale-bx/` per `DATA_CONTRACT.md`; tile sources and the per-site `SITE_GRID_IMAGES` inventory are configured in `frontend/src/config/tiles.ts`.

The API badge reflects the last completed request. Network failures show `API offline`; HTTP 5xx show `API service error`; unreadable JSON or an invalid success schema show `Invalid API response`; timeouts show `API timed out`. Success is recorded only after JSON decoding and endpoint validation. Caller cancellation, including during body decoding, preserves the previous status and returns an `aborted` error.

### `GET /sites`

Returns every site the backend loaded, the default site (`gale-bx`) first and the others by id: `{ "sites": [{ "id", "name", "groups": [...], "stops": [...], "context" }] }`. A site may have no groups or stops. A site folder that fails to load is logged and left out; it never falls back to another site's terrain. `context` is `null` or `{ title, text, sources: [{ title, url, credit }] }`: a short cited text about the site, read from `stops.json`.
The site identity comes from `meta.json`; groups and catalog stops (including note, image and source_id) come from `stops.json`, as specified in `DATA_CONTRACT.md`.

### `POST /route`

Request:

```json
{
  "site_id": "gale-bx",
  "start": { "id": "start", "lon": 77.5, "lat": 18.4 },
  "stops": [
    { "id": "stop-1", "lon": 77.51, "lat": 18.41 },
    { "id": "stop-2", "lon": 77.52, "lat": 18.40, "name": "Optional name" }
  ],
  "constraints": { "max_slope_deg": 15 },
  "profile": "balanced",
  "compare": true
}
```

| Field | Type | Notes |
|-------|------|-------|
| `site_id` | string, optional | The site whose terrain is used. Omitted means the default site `gale-bx`; an unknown id is `404`. Points outside that site's grid are `422`. |
| `start`, `stops[]` | `{ id, lon, lat, name? }` | 1 to 5 stops, in visiting order. `id` is client-generated and stable ("start", "stop-1", ...); echo it back. |
| `constraints.max_slope_deg` | number | Positive hard slope limit, capped at `assumptions.json`'s `slope_limit_deg` |
| `profile` | `"fast" \| "balanced" \| "safe"`, optional | Cost profile, default `balanced` (the original cost). `fast`: step cost `length * (1 + 0.5 * (slope / limit)^2)`, so steeper shortcuts win more often. `safe`: the hard limit is `slope_caution_deg` (10 degrees); if no path exists under it, the normal limit is used and the response says so (`profile_fallback`). An unknown value is `422`. |
| `compare` | boolean, optional | Accepted; this implementation returns `alternative: null` |
| `stop_time_min` | number, optional | Planned minutes at each stop, 0 to 240, default 0. Adds `stops_time_s` to the EVA time checked against `eva_limit_s`. ARES planning input, not a NASA value; the web app sends 15 by default and leaves the field out at 0 |

Response `200` (example values only):

```json
{
  "supports_alternatives": false,
  "computed_at": "2030-01-01T14:32:05Z",
  "distance_m": 4860.0,
  "max_slope_deg": 12.4,
  "est_time_s": 13320,
  "safety": "caution",
  "safety_reason": "Steepest section is 12.4°, above the 10° caution threshold.",
  "polyline": [[77.5, 18.4], [77.501, 18.402]],
  "navigation": { "vertex_dist_m": [0, 4860.0], "heading_segments": [0] },
  "stops": [
    { "id": "stop-1", "name": null, "lon": 77.51, "lat": 18.41, "dist_m": 1200.0,
      "note": "Short science note", "image": { "url": "https://…", "alt": "…", "credit": "…" } }
  ],
  "hazards": [
    { "id": "hazard-1", "kind": "steep_slope", "label": "Slope over 15 deg",
      "polygon": { "type": "Polygon", "coordinates": [[[77.5, 18.4], [77.5, 18.5], [77.6, 18.5], [77.5, 18.4]]] } }
  ],
  "profile": [
    { "dist_m": 0, "elev_m": -2510.0, "slope_deg": 0.0 },
    { "dist_m": 20, "elev_m": -2508.5, "slope_deg": 4.3 }
  ],
  "assumptions": [
    { "name": "Travel speed", "value": "0.5 m/s", "source": "Document or model name" }
  ],
  "alternative": { "distance_m": 5100.0, "max_slope_deg": 9.8, "est_time_s": 14000, "polyline": [[77.5, 18.4], [77.502, 18.401]] }
}
```

**Every field the backend must provide** (all required unless marked):

| Field | Type | Notes |
|-------|------|-------|
| `computed_at` | ISO 8601 UTC string | Shown as "Computed HH:MM:SS UTC" |
| `distance_m`, `max_slope_deg`, `est_time_s` | number | Route summary |
| `safety` | `"ok" \| "caution" \| "avoid"` | UI labels: "Route within limits", "Proceed with caution", "Avoid this route" |
| `safety_reason` | string | One plain sentence saying why |
| `polyline` | `[lon, lat][]`, 2+ points | Start through every stop |
| `navigation` | object, optional on legacy responses | Exact vertex distances and heading-edge references, described below |
| `supports_alternatives` | boolean, optional on legacy responses | Route-service capability; defaults to false. Current backend: false; mock: true. Compare depends on the route response, independently of `/layers` |
| `stops[]` | see below | Same order as the request |
| `stops[].id` | string | Echo of the request id |
| `stops[].name` | string \| null | UI falls back to "Stop A", "Stop B", ... |
| `stops[].lon`, `.lat` | number | Echo of the requested position. The UI discards note and image if these differ from where the user has the stop now |
| `stops[].dist_m` | number | Distance along the route at which the stop is reached |
| `stops[].note` | string \| null | Short science note |
| `stops[].image` | `{ url, alt, credit } \| null` | Rover image. Only `http(s)` URLs are used. `alt` and `credit` are mandatory when an image is present |
| `hazards[]` | `{ id, kind, label, polygon }` | `kind`: `rough_terrain \| sand_trap \| steep_slope \| other`. `polygon` is a GeoJSON Polygon in lon/lat with closed rings (the first is the outline, any others are holes). `label` is drawn on the map. The backend returns `steep_slope` zones only, see below |
| `profile[]` | `{ dist_m, elev_m, slope_deg }` | `dist_m` strictly increasing from 0. `slope_deg` is the absolute local slope at the sample. Aim for a sample every 10 to 50 m |
| `assumptions[]` | `{ name, value, source }` | Listed under "How this is computed" |
| `alternative` | object \| null | Only when `compare: true`. Null if no alternative exists |
| `route_profile` | `"fast" \| "balanced" \| "safe"`, optional | The profile asked for |
| `profile_fallback` | boolean, optional | True when `safe` found no path under the caution threshold and the normal limit was used |
| `stats` | `{ slope_class_pct: { ok, caution, avoid }, climb_m, descent_m }`, optional | Share of the distance in each slope class (up to `slope_caution_deg`, up to the route limit, above it; adds up to 100) and the summed climb and descent of the walked cells |
| `return` | `{ distance_m, est_time_s }` \| null, optional | The walk back along the same stops, reversed, from the last stop to the start; null if there is no path back |
| `round_trip_time_s` | number \| null, optional | `est_time_s` plus `return.est_time_s` |
| `eva_limit_s` | number \| null, optional | The EVA time limit used for `status`, from `assumptions.json` (`eva_limit_s`, 8 h, NASA EVA-EXP-0075 [1]); null when the site has none |
| `stops_time_s` | number, optional | Number of stops × `stop_time_min` × 60 |
| `eva_time_s` | number \| null, optional | `round_trip_time_s + stops_time_s`, the time checked against `eva_limit_s`; null with no path back |
| `return_check` | object \| null, optional | Longest walk back to the start from any route point, see below; null when the site sets no return limit |
| `status` | `"GO" \| "CAUTION" \| "NO-GO"`, optional | `NO-GO`: no path, `eva_time_s` exceeds `eva_limit_s`, or `return_check.ok` is false. `CAUTION`: the maximum slope is above `slope_caution_deg`, or `safe` fell back. Otherwise `GO` |
| `reasons` | string[], optional | Plain sentences behind `status`; for `GO` they say what was checked |
| `readiness` | `{ level, reasons }`, optional | The same judgement as `status` under other names, next to it (`status` stays for compatibility). `level`: `NOT_ADVISED` (no path, or `round_trip_time_s` is over `eva_limit_s`; the `status` is `NO-GO`), `MARGINAL` (the maximum slope is above `slope_caution_deg`, or the `safe` profile fell back; `CAUTION`), otherwise `NOMINAL` (`GO`). `reasons` are the same sentences as the top-level `reasons` |

All the fields from `route_profile` to `readiness` are additive: nothing above was renamed or removed, and `safety` and `safety_reason` keep their meaning. When there is no route at all, the `422` body also carries `"status": "NO-GO"`, `"reasons": [<the same text as detail>]` and `"readiness": { "level": "NOT_ADVISED", "reasons": [<the same text>] }`.

`navigation.vertex_dist_m` has one cumulative distance in backend metres per polyline vertex, beginning at 0 and ending at `distance_m`. `navigation.heading_segments[i]` is the zero-based index of the edge whose direction applies while traversing edge `i` (vertex `i` to vertex `i+1`). A normal A* edge references itself. The backend assigns departure/arrival connectors to the first/last actual A* edge of their own leg, including at intermediate stops. Genuine movement within a single cell references itself. No cell-size or length heuristic is used by the HUD.

The HUD interpolates position against these exact distances and uses the outgoing edge at a stop or corner, the incoming edge at the final vertex. Duplicate/coincident stops add no artificial heading change. Distances and headings are prepared once per immutable route response. Older responses without navigation metadata retain raw geometric tangents; the client does not guess which edges are connectors. The validator checks array lengths, distance order/endpoints, reference bounds and canonical nonzero heading edges. Navigation is HUD-only metadata: if it fails these checks, the UI drops it with a console warning and treats the response as legacy; the route itself is still accepted.

Notes for the backend:
- The grid and companion JSON files are loaded once at startup from `backend/data/gale-bx/`. Restart the process after replacing data. Missing, invalid, or truncated files produce `503`; there is no automatic terrain substitution.
- Routes use eight-neighbour A*, with cost `step_length * (1 + (destination_slope / effective_limit)^2)`. No-data cells and cells over the effective limit are blocked. Diagonal movement cannot cut through blocked corners.
- Stops are visited in request order. Requested ids, coordinates and names are echoed; note/image are attached only when the requested position matches a catalog stop (within `1e-8` degrees), so moving a point does not keep stale science information.
- Profile samples come from the same traversed cells as the polyline, approximately every 20 m plus the endpoints, stop boundaries and the steepest sample in each interval of each leg. The maximum slope considers every traversed cell. Time uses `distance_m / (speed_kmh / 3.6)`. Assumptions contain `assumptions.json.items` plus an effective route slope limit, showing both the requested and site limits and their minimum. Safety uses the data's caution threshold; `safety_reason` also states the effective route limit. A successful route cannot be `avoid`: cells above the effective limit are blocked, so an impossible route returns 422. `alternative` is null, including when `compare: true`. `hazards` holds the steep-slope zones: the 4-connected groups of cells steeper than the effective route slope limit, which are the cells the router cannot cross. Groups under 10 cells are dropped, at most 8 are returned (the ones nearest to the route first), outlines are simplified, and no zone contains a point of the returned `polyline`. Ids are `hazard-1` to `hazard-8`, label `Slope over <limit> deg` (`backend/app/services/hazards.py`).
- With `profile: "safe"` or `"fast"` the `assumptions` list gets one more item, "Route profile". Hazard zones are built from the hard limit the route actually used.
- A point outside the grid, in no-data, above the limit, or a disconnected leg returns `422` with a plain-language `detail` naming the point or leg. Input validation also returns `422`.
- The UI colours slope classes itself using two thresholds from `frontend/src/config/route.ts` (`cautionDeg`, `maxDeg`). **They are placeholders until the team confirms them.** If the backend should own the thresholds, add them to the response (for example `slope_limits: { caution_deg, max_deg }`) and the UI will read them from there.
- `profile` and `polyline` describe the same route. The HUD uses exact `navigation.vertex_dist_m`; other map/profile interactions retain fraction-based interpolation.
- Errors: `422` for invalid input (for example no stops, or more than five), `5xx` otherwise. The UI shows a plain-language message. For 422, a string `detail` is shown as text; validation arrays and non-JSON bodies use a generic points-rejected message. Other status codes use generic messages.
- CORS: allow the frontend origin (`http://localhost:5173` in dev).

**Return check** (`backend/app/services/eva.py`). For every polyline vertex the backend finds the shortest walkable way back to the start: Dijkstra in metres from the start cell over the cells the route may use (valid, slope at or below the route's hard limit, 8 neighbours, no diagonal squeeze between blocked cells), plus the short click-to-cell connectors. It is the shortest way home, not the gentlest, and it does not follow the stops. `return_check` = `{ ok, worst_return_m, worst_return_s, worst_point: [lon, lat], worst_route_dist_m, limit_m, limit_s }`: the vertex with the longest walk back, where it is along the route, and the limits from `assumptions.json` (`return_limit_m` 2000, `return_limit_s` 3600). Time is distance / walking speed. `ok` is true when the walk back is within both limits. Limits from NASA EVA-EXP-0075 [1]: "Walking Range 2 km" and "Secondary O2 on suit provides an additional hour of gas"; lunar Artemis values, no Mars standard was found.

**What the web app shows from these fields** (`frontend/src/components/`): `route_profile` and `profile` in the request become a Fast / Balanced / Safe selector (Balanced is not sent); `status` and `reasons` a GO / CAUTION / NO-GO badge with its sentences; `round_trip_time_s`, `return`, `stats` and `eva_limit_s` the round-trip, way-back, climb, descent and slope-class bar, with a "TO VERIFY" tag while the EVA limit is unverified; `return_check` a "Return to start" row with a time-at-stop selector, and `eva_time_s` / `stops_time_s` the EVA time line. `POST /route/sensitivity` fills the "Slope limit sensitivity" table, requested only while its drawer is open; `GET /conditions` the "Mars weather" card, which is not drawn when `available` is false. A malformed value in one of the added route fields is dropped with a console warning; the route itself stays usable.

### `POST /route/sensitivity`

Same body as `POST /route`. Plans the same stops with hard slope limits of 10, 15 and 20 degrees and reports what each limit costs:

```json
{
  "site_id": "gale-bx",
  "results": [
    { "limit_deg": 10, "reachable": true, "distance_m": 1419.5, "est_time_s": 2555.2, "max_slope_deg": 10.0, "reason": null },
    { "limit_deg": 15, "reachable": true, "distance_m": 1281.5, "est_time_s": 2306.8, "max_slope_deg": 13.0, "reason": null },
    { "limit_deg": 20, "reachable": false, "distance_m": null, "est_time_s": null, "max_slope_deg": null, "reason": "No route from 'start' to 'stop-1': ..." }
  ]
}
```

The limits are used as given: this is an analysis, so 20 degrees is tried although the site data caps real routes at its own limit (15). The cost is `balanced`, or `fast` when the request says `fast`; `safe` is treated as `balanced`, because the limit is what varies. A point that is above a limit that is tried makes that limit unreachable (`reason`); a point outside the grid or on no-data is `422` with `status: "NO-GO"`, like `/route`.

### `GET /conditions`

Curiosity REMS weather, proxied from `https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json` (provided by the Centro de Astrobiologia, for outreach) and cached in memory for one hour. Always `200`.

```json
{
  "available": true,
  "provider": "Centro de Astrobiologia (CAB, CSIC-INTA), Rover Environmental Monitoring Station, Mars Science Laboratory",
  "disclaimer": "Provided by CAB for outreach purposes only. ...",
  "source_url": "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json",
  "sol": 4995, "earth_date": "2026-08-25", "ls_deg": 341, "season": "Month 12",
  "air_temp_min_c": -71, "air_temp_max_c": -5, "ground_temp_min_c": -84, "ground_temp_max_c": 4,
  "pressure_pa": 777, "pressure_note": "Higher", "sunrise": "06:46", "sunset": "18:51",
  "uv_index": "Moderate", "opacity": "Sunny", "wind_speed": null,
  "fetched_at": "2026-11-15T05:34:50Z"
}
```

The newest sol of the feed. A value the feed gives as `--` is `null`. The numbers are measured at the rover's own position, are not a forecast, and do not describe a planned route. On any failure (network, status, bad JSON, unexpected shape) the answer is `{ "available": false, "reason": "..." }`; a failure is retried after one minute, a success after one hour.

### `GET /geology`

The geologic unit at a point of a site, from the USGS Geologic Map of Mars (SIM 3292, Tanaka and others, 2014, scale 1:20,000,000), read from the site's `geology.json` (`docs/DATA_CONTRACT.md`, section 11; made by `scripts/make_geology.py`). Query: `lon` (-180 to 180, east), `lat` (-90 to 90), optional `site_id` (default `gale-bx`, unknown id `404`). Out-of-range or missing numbers are `422`. Every other case is `200`:

```json
{
  "available": true, "site_id": "gale-bx",
  "unit": "Htu", "name": "Hesperian transition undivided unit",
  "scale": "1:20,000,000",
  "source": { "title": "Geologic Map of Mars (SIM 3292)", "url": "https://pubs.usgs.gov/sim/3292/", "citation": "Tanaka, K.L., ..." },
  "note": "Global map at 1:20,000,000: ..."
}
```

`unit` is the map's code and `name` its short unit description (the database field `UnitDesc`); the long descriptions are in the map's Description of Map Units, linked from `geology.json`. At this scale a site of a few square kilometres lies inside one unit, so the answer is a regional context, not a local mapping. When there is nothing to say the answer is `{ "available": false, "reason": "..." }`: the site has no `geology.json` (or it is malformed or for another bbox), the point is outside the site's bbox, or no mapped unit holds the point. `GET /layers` still reports `geology` as "No data for this site": there is no map image for it.

