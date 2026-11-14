# API-контракт

Base URL: `http://localhost:8000/api/v1` · Интерактивная дока: `/docs` (Swagger).

Источник правды - Pydantic-схемы в [`backend/app/schemas/`](../backend/app/schemas/). Этот файл - человекочитаемая версия для фронта.

## `GET /health`
```json
{ "status": "ok", "data_loaded": true }
```

`data_loaded` показывает, загружена ли сетка при старте. Без файлов health остаётся доступным, а `/layers`, `/sites`, `/route` возвращают `503` с понятным `detail`. ML-заглушка `/predict` удалена.

---

### Как менять контракт
1. Обнови схему в `backend/app/schemas/`.
2. Обнови этот файл и типы в `frontend/src/api/client.ts`.
3. Всё - в одном PR, отметь фронт и бэк ревьюерами.

---

## Frontend proposal: route planning (ARES UI)

> **Status: implemented in the backend.** The response shapes below match [`frontend/src/api/types.ts`](../frontend/src/api/types.ts) and the runtime validators in [`validate.ts`](../frontend/src/api/validate.ts).
>
> `VITE_USE_MOCK=true` enables frontend-only mock responses. The backend reads the committed real terrain from `backend/data/gale-bx/`; the frontend metadata and rasters match that grid.

Conventions: coordinates are `[lon, lat]` in degrees on Mars, longitude east-positive in -180..180 (GeoJSON order). Distances in metres, slopes in degrees, times in seconds. All numbers on screen come from these responses; the UI has no hardcoded metrics.

### `GET /layers`

Which data layers exist for the site. A layer that is missing or has `available: false` is shown disabled with its `reason`.

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
| `layers[].reason` | string \| null | Shown when not available. Default text: "No data for this site" |
| `layers[].source` | string \| null | Dataset and provider, shown in the layer legend |

Layer imagery itself is not served by the API. Grid images are in `frontend/public/data/gale-bx/` per `DATA_CONTRACT.md`; tile sources are configured separately in `frontend/src/config/tiles.ts`.

### `GET /sites`

Returns `{ "sites": [{ "id", "name", "groups": [...], "stops": [...] }] }`.
The site identity comes from `meta.json`; groups and catalog stops (including note, image and source_id) come from `stops.json`, as specified in `DATA_CONTRACT.md`.

### `POST /route`

Request:

```json
{
  "start": { "id": "start", "lon": 77.5, "lat": 18.4 },
  "stops": [
    { "id": "stop-1", "lon": 77.51, "lat": 18.41 },
    { "id": "stop-2", "lon": 77.52, "lat": 18.40, "name": "Optional name" }
  ],
  "constraints": { "max_slope_deg": 15 },
  "compare": true
}
```

| Field | Type | Notes |
|-------|------|-------|
| `start`, `stops[]` | `{ id, lon, lat, name? }` | 1 to 5 stops, in visiting order. `id` is client-generated and stable ("start", "stop-1", ...); echo it back. |
| `constraints.max_slope_deg` | number | Positive hard slope limit, capped at `assumptions.json`'s `slope_limit_deg` |
| `compare` | boolean, optional | Accepted; this implementation returns `alternative: null` |

Response `200` (example values only):

```json
{
  "computed_at": "2030-01-01T14:32:05Z",
  "distance_m": 4860.0,
  "max_slope_deg": 12.4,
  "est_time_s": 13320,
  "safety": "caution",
  "safety_reason": "Steepest section is 12.4°, above the 10° caution threshold.",
  "polyline": [[77.5, 18.4], [77.501, 18.402]],
  "stops": [
    { "id": "stop-1", "name": null, "lon": 77.51, "lat": 18.41, "dist_m": 1200.0,
      "note": "Short science note", "image": { "url": "https://…", "alt": "…", "credit": "…" } }
  ],
  "hazards": [
    { "id": "hazard-1", "kind": "rough_terrain", "label": "Rough terrain",
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
| `stops[]` | see below | Same order as the request |
| `stops[].id` | string | Echo of the request id |
| `stops[].name` | string \| null | UI falls back to "Stop A", "Stop B", ... |
| `stops[].lon`, `.lat` | number | Echo of the requested position. The UI discards note and image if these differ from where the user has the stop now |
| `stops[].dist_m` | number | Distance along the route at which the stop is reached |
| `stops[].note` | string \| null | Short science note |
| `stops[].image` | `{ url, alt, credit } \| null` | Rover image. Only `http(s)` URLs are used. `alt` and `credit` are mandatory when an image is present |
| `hazards[]` | `{ id, kind, label, polygon }` | `kind`: `rough_terrain \| sand_trap \| steep_slope \| other`. `polygon` is a GeoJSON Polygon with closed rings. `label` is drawn on the map |
| `profile[]` | `{ dist_m, elev_m, slope_deg }` | `dist_m` strictly increasing from 0. `slope_deg` is the absolute local slope at the sample. Aim for a sample every 10 to 50 m |
| `assumptions[]` | `{ name, value, source }` | Listed under "How this is computed" |
| `alternative` | object \| null | Only when `compare: true`. Null if no alternative exists |

Notes for the backend:
- The grid and companion JSON files are loaded once at startup from `backend/data/gale-bx/`. Restart the process after replacing data. Missing, invalid, or truncated files produce `503`; there is no automatic terrain substitution.
- Routes use eight-neighbour A*, with cost `step_length * (1 + (destination_slope / effective_limit)^2)`. No-data cells and cells over the effective limit are blocked. Diagonal movement cannot cut through blocked corners.
- Stops are visited in request order. Requested ids, coordinates and names are echoed; note/image are attached only when the requested position matches a catalog stop (within `1e-8` degrees), so moving a point does not keep stale science information.
- Profile samples come from the same traversed cells as the polyline, approximately every 20 m plus the endpoints. The maximum slope considers every traversed cell. Time uses `distance_m / (speed_kmh / 3.6)`. Assumptions contain `assumptions.json.items` plus an effective route slope limit, showing both the requested and site limits and their minimum. Safety uses the data's caution threshold; `safety_reason` also states the effective route limit. A successful route cannot be `avoid`: cells above the effective limit are blocked, so an impossible route returns 422. `hazards` is currently empty and `alternative` is null, including when `compare: true`.
- A point outside the grid, in no-data, above the limit, or a disconnected leg returns `422` with a plain-language `detail` naming the point or leg. Input validation also returns `422`.
- The UI colours slope classes itself using two thresholds from `frontend/src/config/route.ts` (`cautionDeg`, `maxDeg`). **They are placeholders until the team confirms them.** If the backend should own the thresholds, add them to the response (for example `slope_limits: { caution_deg, max_deg }`) and the UI will read them from there.
- `profile` and `polyline` describe the same route; the UI maps a profile distance to the same fraction of the polyline length.
- Errors: `422` for invalid input (for example no stops, or more than five), `5xx` otherwise. The UI shows a plain-language message and never prints the response body.
- CORS: allow the frontend origin (`http://localhost:5173` in dev).
