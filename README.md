# NASA Space Apps - ARES

> NASA Space Apps Challenge 2026 project. **ARES plans a walking route for a person on foot on Mars: it keeps the route within slope limits and shows how long the walk back takes.**

## Problem

A person walking on Mars needs a route that respects slope limits and a safe way back. Satellite images show terrain, but not whether a given line across it is walkable, how steep each stretch is, or how far from the start the walk goes.

## Solution

ARES plans a Marswalk route at Gale crater (boxwork, Mount Sharp):

- **Terrain.** A 2 m grid of elevation and slope built from a HiRISE digital terrain model (DTM).
- **Routing.** The backend runs A* over the slope grid (8 neighbours). A cell steeper than the slope limit cannot be crossed. The route goes from a start through up to 5 stops.
- **Limits with sources.** The slope limits, walking speed and maximum distance from the start are listed with their sources in `backend/data/gale-bx/assumptions.json`. They cite NASA and JPL documents [1] to [5], also listed in `frontend/src/config/references.ts`.
- **Three modes** in the web app:
  - **Plan:** map with the layers that have data (slope, hillshade over Mars imagery, thermal), stops, route summary with the estimated radiation dose of the walk, elevation profile, a short "Why this site" note and a "How this is computed" panel. Layers without data are marked "No data for this site".
  - **HUD:** a heads-up view with compass, next stop and slope. The position moves with a slider (simulated).
  - **Card:** a printable one-page A4 route card with the map, stops, slope by leg, safety margins, the estimated radiation dose and the sources.

## Data and sources

From `backend/data/gale-bx/meta.json` and `sources.json`:

- **Terrain:** HiRISE DTM `DTEEC_009149_1750_009294_1750_U01`, NASA/JPL/University of Arizona. The grid cell is 2 m and slopes are smoothed over a 5 m window.
- **Imagery:** Viking MDIM 2.1 colour mosaic through NASA/JPL Mars Trek, used as the map basemap.
- **Science stops:** Curiosity (MSL) waypoints, NASA/JPL, `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` (snapshot in `docs/research/r0/`).
- **Thermal:** USGS Astrogeology "Gale Crater THEMIS Daytime IR ISIS", NASA/ASU/USGS (Mars Odyssey THEMIS). A single 2007 observation, 100 m per pixel, drawn as blocks; stretched 8-bit values, not calibrated temperature.
- **Radiation:** average galactic cosmic ray dose equivalent rate of 0.67 mSv per day at the Gale surface (August 2012 to June 2013), measured by Curiosity RAD: Hassler et al., Science 2013, https://doi.org/10.1126/science.1244797. The dose of a walk is this rate times the walking time; galactic cosmic rays only, not a forecast.
- **Site context:** the "Why this site" text comes from NASA/JPL, "NASA's Curiosity Rover Sees Martian 'Spiderwebs' Up Close" (23 February 2026), reference [6].
- **Slope and walking limits:** documents [1] to [5]; see `ASSETS.md` for links, licenses and where each source is used.

## Limitations

- One site only, and it is preliminary (`"preliminary": true` in `meta.json`). The terrain grid and the science stops need review by the science team.
- The HUD position comes from a slider. There is no live position feed.
- Layers without data show "No data for this site".
- The NASA slope values are lunar and Artemis values. No official human-on-Mars slope standard was found; the 15 degree limit and the 10 degree caution threshold are ARES planning values.
- The science stops are Curiosity waypoints, not curated science targets, and a group is limited to 5 stops.
- ARES is a hackathon project. It is not affiliated with NASA and is not certified for operational use.

## How to run

```bash
# backend (Python 3.10+), http://localhost:8000
cd backend && python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt        # requirements.txt is enough to run, -dev adds test tools
uvicorn app.main:app --reload

# frontend, http://localhost:5173/app/ (in a second terminal)
cd frontend && npm install && npm run dev
```

Tests: `cd backend && pytest`, and `cd frontend && npm run lint && npm test && npm run build`.

## Архитектура

```
┌────────────┐   HTTP/JSON   ┌────────────┐   чтение при старте   ┌─────────────────┐
│  frontend  │ ────────────▶ │  backend   │ ───────────────────▶ │ data/gale-bx/   │
│ React+Vite │               │ FastAPI/A* │                       │ рельеф и цели   │
└────────────┘               └────────────┘                       └─────────────────┘
     :5173                        :8000                         backend/data/
```

| Слой | Стек | Папка |
|------|------|-------|
| Frontend | React 18, TypeScript, Vite | [`frontend/`](frontend/) |
| Backend | Python 3.10+, FastAPI, Pydantic; Vercel/Docker: Python 3.12 | [`backend/`](backend/) |
| Infra | Docker Compose, шаблоны GitHub | [`docker-compose.yml`](docker-compose.yml), [`.github/`](.github/) |

Подробнее - [docs/architecture.md](docs/architecture.md), контракт API - [docs/api.md](docs/api.md).

## Структура проекта

```
nasa-space-apps-ares/
├── .github/                # шаблоны PR/issue
├── docs/                   # архитектура, API-контракт, доска задач
├── frontend/               # клиент (React + Vite + TS)
│   └── src/api/            # клиент к backend
├── backend/                # API (FastAPI)
│   ├── app/api/routes/     # эндпоинты
│   ├── app/core/           # конфиг
│   ├── app/schemas/        # Pydantic-модели (контракт API)
│   ├── app/services/       # загрузка сетки и маршрутизация A*
│   └── tests/
├── ml/                     # неиспользуемый шаблон, не часть продукта
├── scripts/                # утилиты: сетка уклонов, тепловой слой, настройка GitHub
└── docker-compose.yml
```

## Быстрый старт

### Через Docker
```bash
cp .env.example .env
docker compose up --build
```
- Frontend: http://localhost:5173
- Backend: http://localhost:8000 · Swagger: http://localhost:8000/docs

### Локально

**Backend**

Локально поддерживается Python 3.10 и новее. В Vercel (`backend/.python-version`)
и Docker используется Python 3.12. Backend читает готовую сетку из
`backend/data/gale-bx/`. Для тестов: `pip install -r requirements-dev.txt`.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate               # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

## Команда

| Имя | Роль | GitHub |
|-----|------|--------|
| Aikyn Sagyntai | Team lead | [@mathalama](https://github.com/mathalama) |
| … | Frontend | |
| … | Backend | |

## Как контрибьютить

Любая работа начинается с **GitHub Issue**: опиши цель, ожидаемый результат, подзадачи и критерии готовности. Большую задачу раздели на отдельные issues с проверяемым результатом и укажи зависимости между ними.

См. [правила оформления и разделения задач](CONTRIBUTING.md#4-задачи-issues--доска), а также [CONTRIBUTING.md](CONTRIBUTING.md): ветки, коммиты, PR, ревью.

## Лицензия
[Apache License 2.0](LICENSE)
