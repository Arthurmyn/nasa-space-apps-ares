# ARES: repository audit

Written by the assistant that built the frontend and landing in this repo (conflict of interest: it audits its own work). Evidence is cited; anything not verified is marked **Unverified** or **Unknown**.

## 1. Snapshot

| Item | Value |
|---|---|
| Time | Sat 14 Nov 2026, 16:49 (UTC+5) |
| Branch / HEAD | `feat/landing` / `893eb89` (pushed, clean working tree) |
| Official deadline | **Unknown.** Docs list it as open (Q4, Q5 in `docs/research/01-project-overview.md` §16) |
| Ran | `git fetch --all`, branch/commit analysis; `npm run lint`, `npm test`, `npm run build` in `frontend/` and `landing/`; `npm audit`; Python 3.11 venv, `pip install -r backend/requirements.txt -r ml/requirements.txt`, import check, `pytest`; `curl` GET on public URLs; greps for pathfinding, invented data, secrets, TODOs |
| Not run | Dev-server browser smoke test today (the same code passed 24/24 browser checks earlier in this session, including a production build); R0 script tests (they live on a side branch that I did not check out) |

### Git

| Branch | Last commit | Author | State |
|---|---|---|---|
| `origin/main` | 14 Nov 15:47 | Arthurrmyn (merge of PR #2) | Contains the **wrong landing** (see §2). Local `main` is stale (`835ac93`, behind origin) |
| `origin/feat/landing` | 14 Nov 16:03 | Arthur | **3 commits not in main** (`78493a0`, `85b8d2e`, `893eb89`): restore the Mars scene. Deployed site shows the old version |
| `origin/feature/data-r0-coverage` | 14 Nov 16:47 | Aikyn Sagyntai | **4 commits not in main**, newest work in the repo: R0 coverage scripts, tests, results (22 files). No PR seen |
| `origin/feat/ui` | 14 Nov 15:24 | Arthur | Merged into main |

Commits since 14 Nov 11:00 (all branches): Aikyn 9, Arthur 13, Arthurrmyn 2 (merge commits). **Alikhan 0, Berdibek 0** (their work may be outside git: Unknown). Unpushed commits: none. Local-only work: none.

Last 20 commits: `git log --all -20` (top: `6f3bc37` Aikyn R0 reconcile, `e4a5b2d`, `2ffe28e`, `cd6613a` Aikyn R0; `893eb89`, `85b8d2e`, `78493a0` Arthur landing).

## 2. Component status

| Component | Status | Evidence |
|---|---|---|
| Frontend planner UI (`/app`) | **Partial** | UI complete, but runs on synthetic data only. `lint` pass, 103 unit tests pass, `build` pass (largest chunk `MapView` 1.09 MB, 303 KB gzip; worker 520 KB; nothing over 5 MB) |
| Landing (`/`) | **Partial** | Live `ares-mars.vercel.app/` serves title "ARES: plan one walk on Mars" = my replaced hero, not the team's Mars scene. The right version is only on `feat/landing`. Scene content is a fake seat-booking form (see §5) |
| Data pipeline | **Partial** | `origin/feature/data-r0-coverage`: R0 decision `campaign-covered`, product `DTEEC_009149_1750_009294_1750_U01`, pixel 1.0117 m, radius 3396190 m (`docs/research/r0/gale_bx_handoff.json`). **Not in main. No DEM, slope grid, hillshade or imagery file anywhere** (only footprints and a 150 KB overlay PNG). `planning_ready: false`, AOI "preliminary". Script tests on that branch: **Unverified** |
| Slope/hillshade preprocessing script | **Missing** | No script produces a slope grid or hillshade (grep for gdal/rasterio/slope in scripts: only R0 coverage code) |
| Routing | **Missing** | No A* / Dijkstra / priority queue in any `.ts`, `.tsx` or `.py` file (grep). Route in the UI comes from `frontend/src/api/mock.ts` (sine-wave terrain) |
| Backend (FastAPI) | **Partial, broken in production** | Imports and 1 test pass on Python 3.11 (fails on the macOS default 3.9). Endpoints: `GET /api/v1/health`, `POST /api/v1/predict` only. Public `…/api/v1/health` returns **500 `FUNCTION_INVOCATION_FAILED`**, `POST /api/v1/route` returns 500 (cause Unknown) |
| ML | **Missing / not needed** | `ml/src/train.py` is a template classifier with a TODO; no model file. Not needed for D1-D6 |
| Deploy | **Partial** | `vercel.json` (landing `/`, frontend `/app`, backend `/api`). `/app/` returns 200 and its JS asset 200. Production defaults to **live API mode** (`VITE_USE_MOCK` not set), so the planner depends on the failing backend. Expected result: layer-list and route error banners (inferred from code and HTTP 500, not browser-verified) |
| Submission material | **Missing** | `docs/` has no slides, video script, screenshots, form draft or AI-use note. `docs/context/` is empty |

## 3. Definition of Done

Routing approach today: **neither.** The frontend calls `POST /route` and `GET /layers` (`frontend/src/api/client.ts:71,79`) that the backend does not have; the only working path is the mock. Browser-side A* does not exist.

| | Verdict | Evidence |
|---|---|---|
| D1 Basemap + slope layer | **Missing** (code Partial) | Plain dark background + coordinate grid. Raster layer code exists (`frontend/src/map/useRasterLayers.ts`, tested earlier against a synthetic local tile server) but `frontend/src/config/tiles.ts:16` has `url: null` for every layer. No hillshade, no imagery, no slope raster |
| D2 Hazard zones + threshold with source | **Partial** | Hatched dashed hazard polygons render (`frontend/src/map/layers.ts:80-82`) but come from `mock.ts` (generated circles beside the route), not from slope. Threshold is a placeholder `10°/15°` (`frontend/src/config/route.ts:23-25`, TODO). Docs say 15° (lunar analog, Peña-Asensio 2024), 20° option. "How this is computed" lists only what the API returns |
| D3 Click start/stops, drag, recompute | **Done (UI)** | Click `map/useMapInteractions.ts:44`, drag `map/useMarkers.ts:42`, debounce in `state/PlannerContext.tsx`. Max 5 stops. Route itself is fake |
| D4 Summary + elevation profile | **Partial** | `components/RouteSummary.tsx`, `components/ElevationProfile.tsx:188` work. Numbers come from the sine terrain; mock time uses 0.8 m/s, docs default is 2 km/h |
| D5 2-3 science stops, note, image, credit, license | **Partial** | Stop card with image slot, alt text and credit line (`components/StopCard.tsx:58-67`). No real stops, notes or images in the repo (no Mastcam/Navcam/PIA references in code or data). Mock note says "Sample note" |
| D6 "How this is computed" | **Partial** | Disclosure exists (`RouteSummary.tsx:84`); content depends on backend. Assumption values and sources exist in docs (landing "Assumptions" table) but are not wired to the app |

Invented data in the UI: none found (grep for mission ID, sol, GNSS, wind, dust, oxygen, hardcoded km/° in components: no hits). Mock data is gated behind `VITE_USE_MOCK=true` and shows a "Sample data" badge.

## 4. Blockers ranked by impact

| # | Blocker | Affects | Fastest fix |
|---|---|---|---|
| 1 | No real elevation data in the repo; DTM not downloaded; AOI "preliminary", no habitat or targets (`planning_ready: false`) | D1, D2, D4 | Aikyn clips the 1.01 m DTM to the handoff AOI (about 0.63 x 0.86 km, 137.377-137.388 E, 4.796-4.810 S) and writes slope grid + hillshade PNG to `frontend/public/data/gale-bx/`. Tiny grid (about 0.55 M cells) |
| 2 | No route computation anywhere | D3, D4 | Browser A* on that grid in `frontend/src/lib/` behind the existing `RouteResponse` contract; replaces `mock.ts`. No backend needed |
| 3 | Public site: backend 500, planner defaults to live API, main has the wrong landing | all public-URL criteria | Either drop the `backend` service from `vercel.json` (browser routing) or fix the function; merge `feat/landing`; set `VITE_USE_MOCK` explicitly until data lands |
| 4 | Data work stranded on a side branch | all data tasks | PR `feature/data-r0-coverage` into main today |
| 5 | No science stops/notes/images | D5 | Alikhan supplies 2-3 targets inside the AOI with a PIA ID, credit and license |
| 6 | Threshold and defaults unconfirmed | D2, D6 | Alikhan confirms 15° (20° option), speed 2 km/h in a short doc; Arthur reads them from config |

## 5. Compliance findings

| Area | Finding |
|---|---|
| ASSETS.md | Present, 75 lines. Covers fonts, libraries, icons, tiles (none), landing images. **Gaps:** Higgsfield license and AI disclosure unrecorded; R0 footprint/rover GeoJSON source licenses not recorded (they are on the side branch) |
| AI images / watermark | Landing scene loads 4 AI-generated images hotlinked from `images.higgs.ai` (`landing/index.html`). **No visible AI watermark or disclosure** (grep: none). Docs (R9, Q13) require watermark and disclosure. Image contents (faces?) **Unverified** |
| NASA branding | No logo/insignia files tracked. Text mentions only; footer disclaimer "not affiliated with NASA" is present in the project sections |
| Sample/mock data labels | Planner: labelled. **Landing scene: fake booking form ("Depart Earth 12 Mar 2041", "Passengers 2 adults"), "Redline" brand and a seat-search button, unlabelled.** Conflicts with the "no fabricated data" rule |
| Language | UI and landing in English. `README.md`, `docs/api.md`, `docs/architecture.md`, research notes in Russian (internal) |
| Secrets | `.env` not tracked (only `.env.example`). Pattern scan over all reachable commits (OpenAI/GitHub/Google/AWS key shapes, `*_KEY=` assignments): no matches |
| Licenses | `LICENSE` MIT. No copied third-party code or data found. Fonts OFL, three.js MIT, maplibre BSD-3 |
| External requests | Landing: Google Fonts and the Higgsfield CDN (IP leaks to third parties; hotlinks can break). Planner: none |
| Dependencies | `npm audit`: 2 vulnerabilities (1 moderate, 1 high) in the pinned Vite 5.4.11 chain, dev-server only |
| Large files | None tracked over 1.1 MB on main. Side branch adds a 1.09 MB footprint GeoJSON |

## 6. Contract mismatches

| # | Mismatch |
|---|---|
| 1 | `docs/api.md` (health, predict) matches `backend/app/schemas/predict.py`: **no mismatch** |
| 2 | `docs/api.md` "Frontend proposal" (`POST /route`, `GET /layers`) and `frontend/src/api/types.ts` have **no backend implementation** (404 or 500) |
| 3 | Spec STS (`docs/MARSWALK_COMPLETE_SYSTEM_TECHNICAL_SPECIFICATION_v1.1.md:187`): `GET /regions`, `GET /regions/{id}/layers`, `POST /plan`. Overview doc: `GET /aoi/{id}`, `GET /layers`, `POST /plan`. Frontend uses `/route`. **Three different names** |
| 4 | Provenance contract `{value, unit, source_tag, label}` (R7, V12) is **absent from frontend types** (`source_tag` grep: none) |
| 5 | Targets: docs R3 up to **6**; frontend `MAX_STOPS = 5` (`config/route.ts:1`) |
| 6 | Slope limit: docs 15° (20° option); frontend placeholders 10° caution / 15° max |
| 7 | Round trip: docs route is habitat -> targets -> habitat; frontend routes start -> stops with no return leg |
| 8 | AOI centre exists in `gale_bx_handoff.json` (137.3828 E, -4.8032); frontend `config/site.ts` still `0, 0` "Site not configured" |

## 7. Next tasks per person

Gate A (21:30): "a route is computed from real data and shown on the map." Remaining: about 4 h 40 min.

**Arthur** (frontend)
1. Merge `feat/landing` into main; check `https://ares-mars.vercel.app/` shows the Mars scene. *Accept:* page title and 3D planet visible. **10 min**
2. `frontend/src/lib/astar.ts` + tests on a synthetic grid; cost = slope penalty, cells above threshold impassable. *Accept:* `npm test` includes a case where the route detours around a steep block and a case with no route returns a named blocker. **60 min**
3. `frontend/src/api/local.ts`: build `RouteResponse` from the grid (polyline, profile, max slope, time from named speed, hazard polygons from cells above threshold); use it instead of `mock.ts`. *Accept:* with `VITE_USE_MOCK` unset the app routes with no backend. **75 min**
4. Show hillshade PNG as a MapLibre `image` source and slope as a raster overlay; set `site.ts` from `meta.json`. *Accept:* hillshade visible at `/app/`. **45 min**

**Aikyn** (data, backend)
1. Open PR for `feature/data-r0-coverage`. *Accept:* PR URL in chat. **10 min**
2. `scripts/make_slope_grid.py`: clip DTM to the handoff AOI, write `frontend/public/data/gale-bx/slope.bin` (or PNG), `hillshade.png`, `meta.json` (bbox, pixel size, radius 3396190, CRS). *Accept:* `python scripts/make_slope_grid.py` finishes and total output under 3 MB; `meta.json` bbox matches the handoff. **90 min**
3. Decide backend: remove the `backend` service from `vercel.json` or fix the 500. *Accept:* `curl -s -o /dev/null -w %{http_code} https://ares-mars.vercel.app/api/v1/health` returns 200, or the service is gone and `/app` still loads. **30 min**

**Alikhan** (science)
1. Short doc `docs/assumptions.md`: slope limit (15°/20°) and source, speed, walk-back, with labels. *Accept:* each value has a source and label; Arthur can read them. **30 min**
2. `frontend/public/data/gale-bx/stops.json`: 2-3 targets inside the AOI, note (one sentence), image URL or PIA ID, credit, license. *Accept:* every entry has all fields; coordinates inside the AOI. **75 min**
3. Draft project form text including the "Use of AI" field. *Accept:* file in `docs/submission.md`. **45 min**

**Berdibek** (quality, assets)
1. ASSETS.md: record Higgsfield license and AI disclosure, or replace the 4 images; add a visible "AI-generated" note on the scene. *Accept:* ASSETS row complete; note visible on `/`. **45 min**
2. Decide on the fake booking form on the landing (remove or label "Concept"). *Accept:* no unlabelled dates/passengers on `/`. **15 min**
3. QA script for D1-D6 on the public URL in a private window. *Accept:* checklist with pass/fail per item. **30 min**
4. Slide skeleton (7 slides max) and confirm official deadline and time zone. *Accept:* `docs/slides.md` outline; deadline written in `docs/submission.md`. **60 min**

**Gate A verdict: reachable, with risk.** Tasks 1-2 of Aikyn and 2-4 of Arthur are the critical path and can run in parallel (Arthur develops on a synthetic grid until the real grid lands). The big unknown is the DTM: its file is not downloaded and the product is about 360 MB. The AOI is only about 0.6 x 0.9 km, so everything after clipping is small. **If the clip is not ready by about 19:30, the smallest cut is:** keep browser A* and the real slope grid but skip hillshade imagery (use slope shading only) and show 2 stops.

## 8. Recommended cuts and what to postpone

| Cut / postpone | Reason |
|---|---|
| FastAPI route logic and the `/plan` endpoint | Browser A* meets D1-D6; the AOI is tiny |
| `ml/` and `/predict` | Not needed for any D item |
| Round trip to the habitat, point of no return, EVA time budget | Docs P0 but not in the DoD; add after gate A |
| Provenance labels on every number (R7/V12) | Do for the 5-6 numbers in the summary only |
| Real tile layers (THEMIS, geology) | No data prepared |
| Landing polish, HUD, card, compare | Already planned cuts or done; stop work there |
| Monte Carlo, radiation, REMS, O2 cards | Postpone |

## 9. Unknowns only the team can answer

1. Where is the clipped or full DTM `DTEEC_009149_1750_009294_1750_U01` now (path, size), and who has it?
2. What is the official submission deadline and its time zone, and what are the form fields?
3. Is the start point the habitat, and must the route return to it for this submission?
4. Who owns the rights to the Higgsfield images, and do we keep them with a visible AI note or replace them?
5. Should `feat/landing` (correct Mars scene) and `feature/data-r0-coverage` be merged into main now?
