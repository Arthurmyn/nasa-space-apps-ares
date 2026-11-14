# ARES frontend

Hyperlocal route planner for a human Marswalk (NASA Space Apps 2026, "Interplanetary Survival Guide: Martian Map"). React 18, TypeScript (strict), Vite, MapLibre GL.

## Run

```bash
npm install
npm run dev          # http://localhost:5173/app/, talks to the backend at VITE_API_URL
```

No backend yet? Use the built-in sample data:

```bash
VITE_USE_MOCK=true npm run dev
```

Mock mode shows a **Sample data** badge in the top bar. The data is synthetic (a sine-wave terrain), never real. `VITE_USE_MOCK` and `VITE_API_URL` are read from the environment or from the repo-root `.env` (Vite `envDir` is `..`). `.env.example` does not list `VITE_USE_MOCK` yet; add `VITE_USE_MOCK=false` there when convenient.

| Command | What it does |
|---------|--------------|
| `npm run lint` | Type check (app and tests, strict) |
| `npm test` | Unit tests for pure functions, using Node's built-in test runner. Needs Node 22.18 or newer (it runs the `.ts` tests directly); tested on Node 24 |
| `npm run build` | Type check, then production build |

The planner is served under `/app/` (Vite `base`) and `npm run build` writes to `dist/app`. The site root redirects to `/app/`; see the root `vercel.json`.

## Using the app

- **Plan** mode: click the map to set a start, then up to 5 stops. Drag a stop to move it; the route recomputes after a short pause and the old route fades to a ghost until the new one arrives.
- Keyboard: Tab to the map or a stop pin; arrow keys move the selected stop (Shift for a bigger step), or pan when nothing is selected; `+` / `-` zoom; Esc clears the selection. "Add stop at map centre" in the Stops panel places a point without a pointer.
- Hovering the elevation profile moves a marker on the map, and hovering near the route on the map moves a cursor on the profile. The profile is also keyboard operable (arrow keys, Home, End).
- **Compare** asks the API for an alternative route and shows a delta table.
- Below 900 px wide the side panels become drawers; the safety status stays visible under the map.

## Layout of `src/`

| Folder | Contents |
|--------|----------|
| `api/` | `types.ts` (contract), `client.ts`, `validate.ts` (runtime checks), `errors.ts`, `mock.ts` (sample data, loaded only in mock mode) |
| `config/` | `site.ts`, `tiles.ts`, `route.ts`, `layers.ts`: everything the team must fill in |
| `lib/` | Pure, tested functions: formatting, slope classes, profile sampling, Mars geometry |
| `state/` | Planner reducer and provider, hover store shared by map and profile |
| `map/` | MapLibre view (lazy-loaded chunk) |
| `components/` | Panels, top bar, elevation profile |
| `styles/` | `tokens.css` is the single source of colours, fonts and sizes |

## Placeholders that need real values

Search the code for `TODO(team)`.

| Where | What |
|-------|------|
| `src/config/site.ts` | Site name, latitude, longitude, zoom. Currently "Site not configured" at 0/0 |
| `src/config/tiles.ts` | A tile URL per layer, with attribution. Currently all `null`, so the map is a plain dark background with a coordinate grid |
| `src/config/route.ts` | `SLOPE_LIMITS`: caution and maximum slope in degrees (placeholders 10 and 15) |

The API contract is a proposal; see "Frontend proposal" in [`docs/api.md`](../docs/api.md). Licenses and sources for fonts, libraries and data are in [`ASSETS.md`](../ASSETS.md).

## Notes

- Scale bar, grid spacing and distances use Mars' radius (3389.5 km). MapLibre's own scale control assumes Earth, so it is not used.
- The MapLibre worker is registered explicitly in `src/map/worker.ts`; without it the worker 404s under Vite.
- Raster tile layers (`src/map/useRasterLayers.ts`) are implemented but have not been exercised yet, because no tile source is configured.
