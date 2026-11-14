# ARES: контракт данных v1 (Gale boxwork)

Этот файл общий для данных, бэкенда и фронта. Менять только вместе (один PR, все трое смотрят).
Положить в `docs/DATA_CONTRACT.md`.

## 1. Принцип
- Одна сетка высот и уклонов на участок, север сверху, квадратные ячейки в метрах.
- Сетку делает один скрипт `scripts/make_slope_grid.py`. Бэкенд только читает готовые файлы.
- Реальные данные и тестовые (фейковые) имеют **тот же формат**. Подмена = замена файлов, код не меняется.

## 2. Где лежат файлы
```
backend/data/gale-bx/
  meta.json        описание сетки (см. п. 3)
  elevation.bin    высоты, Float32, little-endian, row-major, метры
  slope.bin        уклоны, Uint8, row-major
  stops.json       цели для списка выбора (п. 5)
  assumptions.json допущения и источники (п. 6)
  sources.json     справочник источников целей: { "source_id": "описание и ссылка" }
frontend/public/data/gale-bx/
  meta.json        копия (скрипт копирует сам)
  hillshade.png    серая подложка рельефа, RGBA, размер width x height
  slope.png        цветной слой уклонов, RGBA с прозрачностью, размер width x height
```
Размер: все файлы вместе до 3 000 000 байт. Из них 100 000 байт зарезервировано под сопутствующие JSON: сама сетка (meta.json ×2, elevation.bin, slope.bin, hillshade.png, slope.png) — не более 2 900 000 байт. При превышении любого лимита скрипт берёт ячейку 2 м (`--cell 2`); если лимит всё ещё превышен, завершается с ошибкой до записи.
Фронт на Vercel обслуживает `frontend/public/data/...` по адресу `/app/data/gale-bx/...`.
Бэкенд читает `backend/data/` (в пределах своей папки, иначе Vercel его не увидит).

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
Если `is_test_data` равно true, фронт показывает бейдж «Test data».

## 4. Как читать сетку
Проекция локальная, равнопромежуточная: `x = R * radians(lon - lon0) * cos(radians(lat0))`, `y = R * radians(lat - lat0)`, где R = `mars_radius_m`, lon0 и lat0 = `center`.
- Столбец: `col = (x - x_min_m) / cell_m`
- Строка: `row = (y_max_m - y) / cell_m` (строка 0 = север)
- Индекс в файле: `i = row * width + col`
- Размер: `elevation.bin` = width*height*4 байта, `slope.bin` = width*height байт.
- Уклон в градусах = `slope.bin[i] * slope_unit_deg`. Значение 255 = нет данных.
- Уклон считается по окну около `slope_window_m` метров (сглаживание шума 1 м DTM).
- Углы PNG: те же `bbox` в градусах (северо-запад, северо-восток, юго-восток, юго-запад).

## 5. stops.json (цели для списка выбора)
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
`image` либо null, либо `{ "url": "...", "alt": "...", "credit": "..." }` (как `StopImage` в `frontend/src/api/types.ts`).
Координаты целей внутри `bbox`. Группа = то, что человек выбирает в списке («Boxwork» и т. д.).
`source_id` разрешается через `backend/data/gale-bx/sources.json` (объект: ID → строка с описанием и ссылкой). Генератор добавляет в `meta.sources` только источники текущих целей как строки `"ID: описание"`; при замене целей меняются данные, а не код генератора. Без `stops.json` справочник не требуется. Формы `stops.json` и `meta.json` сохраняются.

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
Поле `items` уходит в ответ маршрута как `assumptions` (форма как `Assumption` в `types.ts`).
Пока источник не проверен, пишем `TO VERIFY`. Алихан заменяет это настоящим названием документа.

## 7. API (бэкенд)
Базовый путь `/api/v1`. Формы ответов уже описаны в `docs/api.md` (раздел Frontend proposal) и `frontend/src/api/types.ts`. Не менять.
- `GET /api/v1/layers`: слои `slope`, `optical` (hillshade) доступны, остальные `available: false` с причиной.
- `GET /api/v1/sites`: `{ "sites": [ { "id", "name", "groups": [...], "stops": [...] } ] }` из `meta.json` и `stops.json` (новый эндпоинт, фронту нужен для списка выбора).
- `POST /api/v1/route`: A* по `slope.bin`, 8 соседей. Ячейка с уклоном выше `slope_limit_deg` непроходима. Цена шага = длина * (1 + (slope/limit)^2). Остановки по порядку: start, stop-1, stop-2, ...
  - Если пути нет: HTTP 422 и `{ "detail": "<понятная причина, какой отрезок и почему>" }`.
  - `profile` берётся вдоль маршрута из `elevation.bin` и `slope.bin`.
  - `est_time_s = distance_m / (speed_kmh / 3.6)`.
  - `safety`: `ok`, если макс. уклон не выше `slope_caution_deg`; `caution` до `slope_limit_deg`; иначе `avoid`.

## 8. Тестовые данные
`scripts/make_fake_grid.py` создаёт сетку в **том же формате** (наклонная плоскость, два холма и овраг) с `is_test_data: true`. Так бэкенд и фронт идут параллельно, пока нет реального DTM.
