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
  thermal.json     копия описания теплового слоя (п. 2b); если файла нет, слой недоступен
frontend/public/data/gale-bx/
  meta.json        копия (скрипт копирует сам)
  hillshade.png    серая подложка рельефа, RGBA, размер width x height
  slope.png        цветной слой уклонов, RGBA с прозрачностью, размер width x height
  thermal.png      тепловой слой THEMIS, RGBA, размер width x height, bbox из meta.json (п. 2b)
  thermal.json     описание теплового слоя: источник, размер пикселя, диапазон значений, цвета
```
Размер: все файлы вместе до 3 000 000 байт. Из них 100 000 байт зарезервировано под сопутствующие JSON: сама сетка (meta.json ×2, elevation.bin, slope.bin, hillshade.png, slope.png) — не более 2 900 000 байт. При превышении любого лимита скрипт берёт ячейку 2 м (`--cell 2`); если лимит всё ещё превышен, завершается с ошибкой до записи.
### 2b. Тепловой слой (THEMIS)
Делает `scripts/make_thermal_layer.py` из куба USGS Astropedia «Gale Crater THEMIS Daytime IR ISIS» (ссылка и кредит в `ASSETS.md` и в `thermal.json`). Это **один снимок** Mars Odyssey THEMIS (продукт `I24545011RDR`, канал 9, 12,57 мкм), собственный пиксель 100 м, на участок приходится около 70 пикселей. Значения хранятся как растянутые 8-битные числа, это не калиброванная температура. Пиксель со значением 0 (ignore value команды THEMIS) прозрачен.
- `thermal.png`: каждый пиксель сетки участка берёт значение ближайшего пикселя THEMIS (без интерполяции), цвета по шкале из `thermal.json`.
- `thermal.json` (`schema: "ares.thermal/v1"`): `source` (название, URL, кредит, лицензия, product_id, время съёмки, sha256 куба), `native_pixel_m`, `value.site_dn_min/max`, `colormap.stops`, `bbox` (равен bbox из `meta.json`), `notes`. Копия лежит в `backend/data/` и во `frontend/public/data/`.
- Бэкенд считает слой `thermal` доступным, только если `thermal.json` есть, схема верна, а `site_id` и `bbox` совпадают с `meta.json`. Иначе слой остаётся «No data for this site».
- Радиация не слой, а одно число на весь участок: `GET /layers` отдаёт `radiation` как `available: false` с причиной «Single value for the whole site, see route summary». Число (0,67 мЗв/сут) и ссылка [5] лежат в `assumptions.json` (`Radiation dose rate`) и в `frontend/src/config/radiation.ts`.
- Геология: опубликованных GIS-границ геологических единиц для участка найдено не было, слой `geology` остаётся «No data for this site». Заметки целей содержат только проверенные данные путевой точки (сол и координаты).

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
`context` (необязательно, верхний уровень `stops.json`): короткий текст «Why this site» из 2-4 предложений с источниками, `{ "title", "text", "sources": [ { "title", "url", "credit" } ] }`. Только факты со страниц из `sources`; к отдельным целям научные утверждения не привязываем, цели остаются простыми путевыми точками. Каждый источник должен быть в списке `frontend/src/config/references.ts` (карточка печатает его как [6]). API отдаёт `context` внутри `GET /sites`, UI показывает под списком остановок и в карточке.
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
Источник пишем явно и ссылаемся на пронумерованный документ `[n]`; список документов лежит в `frontend/src/config/references.ts` (карточка маршрута печатает его). Если источник ещё не проверен, пишем `TO VERIFY`, фронт покажет метку Unverified.

## 7. API (бэкенд)
Базовый путь `/api/v1`. Формы ответов уже описаны в `docs/api.md` (раздел Frontend proposal) и `frontend/src/api/types.ts`. Не менять.
- `GET /api/v1/layers`: слои `slope`, `optical` (hillshade) доступны всегда; `thermal` доступен, если есть валидный `thermal.json` (п. 2b); `radiation` недоступен с причиной «Single value for the whole site, see route summary»; остальные `available: false` с причиной «No data for this site».
- `GET /api/v1/sites`: `{ "sites": [ { "id", "name", "groups": [...], "stops": [...] } ] }` из `meta.json` и `stops.json` (новый эндпоинт, фронту нужен для списка выбора).
- `POST /api/v1/route`: A* по `slope.bin`, 8 соседей. Ячейка с уклоном выше `slope_limit_deg` непроходима. Цена шага = длина * (1 + (slope/limit)^2). Остановки по порядку: start, stop-1, stop-2, ...
  - Если пути нет: HTTP 422 и `{ "detail": "<понятная причина, какой отрезок и почему>" }`.
  - `profile` берётся вдоль маршрута из `elevation.bin` и `slope.bin`.
  - `est_time_s = distance_m / (speed_kmh / 3.6)`.
  - `safety`: `ok`, если макс. уклон не выше `slope_caution_deg`; `caution` до `slope_limit_deg`; иначе `avoid`.

## 8. Тестовые данные
`scripts/make_fake_grid.py` создаёт сетку в **том же формате** (наклонная плоскость, два холма и овраг) с `is_test_data: true`. Так бэкенд и фронт идут параллельно, пока нет реального DTM.
