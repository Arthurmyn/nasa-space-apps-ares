# NASA resources from the challenge - check

Date of the check: 14 November 2026.
Source of the list: the "NASA Data & Resources" section of the challenge page (5 links).
Goal: understand what each resource is actually useful for in MARSWALK, and close part of Q2 ("what is listed in the Resources 2026 tab").

Method: the pages were loaded directly over HTTP, without browser rendering. For sites that are built by scripts in the browser, only the "shell" is visible; this is noted separately.

Marks: **[fact]** - obtained from the server response; **[inference]** - interpretation; **[not checked]** - could not be seen.

---

## Summary

| # | Resource | Loaded | Usefulness for MARSWALK | For which requirements |
|---|---|---|---|---|
| 1 | JPL Mars Trek | Shell (JS) + **a working JSON API** | **High** | R0, R1, Q7, Q11 |
| 2 | USGS-NASA Planetary Geologic Mapping | Shell only (JS) | Low to medium (context layer) | R1 (optional) |
| 3 | Curiosity's Proposed Path up Mount Sharp | Yes | Medium (visual reference, slide) | R9 |
| 4 | NASA Worldview | Shell only (JS) | None (Earth data) | - |
| 5 | Mars Perseverance Raw Images | Yes (shell) | The resource itself - no; **the Curiosity equivalent - high** | R6 |

Main findings:
1. Mars Trek has a **1 m DEM of Gale** (`Gale_DEM_SMG_1m`), and Curiosity's current position lies inside its frame.
2. mars.nasa.gov has an **open JSON API of Curiosity raw images** with the image ID, camera, sol and author credit - a ready source for R6.
3. mars.nasa.gov has a **GeoJSON of Curiosity's path and latest point** (MMGIS) - a source for R0.

---

## 1. JPL Mars Trek

URL: https://trek.nasa.gov/mars/

### 1.1. What it is

A JPL web portal for exploring Mars: a map with overlays of orbital data layers, profiles, 3-D. **[fact]** The static HTML has only the title "Mars Trek" and a logo; the interface is built by scripts in the browser.

### 1.2. Catalog API

**[fact]** There is a JSON search endpoint (the format looks like Solr):

```
https://trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems
    ?proj=urn:ogc:def:crs:EPSG::104905
    &start=0
    &rows=30
    &key=<query text>
```

The `key` parameter is free text; internally it becomes a query like `text:(Gale* AND DEM*)`.

### 1.3. What was found for Gale

The query `key=Gale` returned **4** records **[fact]**:

| Title | productLabel | Type | Instrument | Frame (lon, lat) | Notes |
|---|---|---|---|---|---|
| Curiosity Landing Site | `Curiosity Landing Site_bookmark` | bookmark | - | 136.7834…138.0688°E, −5.1084…−4.0661° | Just a map view bookmark |
| MRO CTX, Gale Crater Mosaic | `Gale_CTX_BlockAdj_dd` | product | CTX | 135.1843…139.2413°E, −6.5733…−2.8078° | The description says "up to 6 m/pixel". The whole crater |
| **MRO HiRISE, Gale Crater DEM** | **`Gale_DEM_SMG_1m`** | product | HiRISE | **137.1224711…137.7298129°E, −4.9254743…−4.2489631°** | Details below |
| Gale | `Gale` | nomenclature | - | point 137.811°E, −5.3672° | Centre of the crater by nomenclature |

Details of `Gale_DEM_SMG_1m` **[fact]**:
- `item_DBID`: 294172
- `item_UUID`: a0f5221a-0a08-40b9-ae82-75a49aac5afe
- categories: Topography / DEM
- mission: Mars Reconnaissance Orbiter; instrument: HiRISE
- file size: 5,775,684,529 bytes (~5.8 GB)
- created: 2020-06-25T22:50:52Z
- `serviceTypes`: Mosaic, raster
- preview: `https://trek.nasa.gov/tiles/Mars/EQ/Gale_DEM_SMG_1m/thumbnail/Gale_DEM_SMG_1m-`
- the numeric field Resolution = 0; "1m" appears only in the product name
- the coverage field = "Global" - contradicts the frame, apparently a metadata error

The query `key=HiRISE DTM Gale` returned **0** records **[fact]** - there are no separate HiRISE DTMs (of the `DTEEC_...` kind) for Gale in the Trek catalog. In particular, our `DTEEC_001488_1750_001752_1750_U02` is not there.

### 1.4. Catalog vocabulary

**[fact]** The catalog facets include the categories: Slope, Slope Colorized, Hillshade, Traverse Path, Mosaic, Color Mosaic, Photometrically Corrected, Crater.
Missions in the facets: Mars 2020, MRO, MGS, Mars Odyssey, MEX, Viking, Mixed. **MSL / Curiosity is not in the list of missions.**

**[not checked]** Whether there are ready Slope / Hillshade layers and HiRISE orthoimages for Gale - separate queries were not made.

### 1.5. Tiles and download

**[inference]** Judging by the preview path, tiles probably follow the template `https://trek.nasa.gov/tiles/Mars/EQ/<productLabel>/...` (WMTS or XYZ). **[not checked]** The format, and whether there is a direct link to the full DEM file: the catalog JSON has no download link.

### 1.6. What this means for us

- **R0:** `Gale_DEM_SMG_1m` is the main fallback candidate if the main DTM does not cover the rover's area. **[inference]** This is most likely the same "MSL 1 m DEM mosaic" from the context layer table; if so, where CTX/HRSC fill gaps, the UI must say "1 m grid ≠ 1 m data".
- **Q7 (serving tiles):** if Trek tiles are available at the standard template, the orthoimage / hillshade can be shown directly from Trek's servers without serving our own.
- **Q11 (does Trek make routes):** the catalog has a "Traverse Path" category - these are ready layers of paths already driven, not a planner. Trek's own interface has elevation profile tools; an EVA planner with a time budget and a point of no return is not there **[inference, from knowledge of the product; the interface was not opened in this check]**.
- Coordinates in the catalog are in `EPSG::104905` (ESRI Mars 2000). **[not checked]** Sphere or ellipsoid; verify before overlaying (see `02-r0-coverage-gate.md`, step 4).

---

## 2. USGS-NASA Planetary Geologic Mapping Program

URL: https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars

**[fact]** The page returned HTTP 200, but the text is only the title "Interactive Maps: Mars" (22 characters). The list of maps, scales and links are loaded by ArcGIS Hub scripts and are not visible on a direct load.

**[inference, from general knowledge of the program]** The program publishes standardized geologic maps: a global map of Mars (scale 1:20,000,000) and regional/quadrangle maps. For a site a few kilometres across, this scale is too coarse.

Usefulness:
- as a **context layer** "geologic unit" on an overview map - yes, if a map covering Aeolis Mons is found;
- for the route - no.

**[not checked]** Whether any of the maps is specifically about Gale / Mount Sharp. To check, open the page in a browser or query the ArcGIS Hub API directly.

---

## 3. Curiosity's Proposed Path up Mount Sharp

URL: https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/

**[fact]**
- Title: "Curiosity's Proposed Path up Mount Sharp".
- Number: **PIA23179** (visible only in file names).
- Published: 15 May 2019. The page was updated on 14 November 2024. The download file is dated 9 March 2024.
- What it shows: an animation of Curiosity's proposed route up the lower part of Mount Sharp. The annotated version labels the areas that the science team wanted to explore in the following years. An overview video is mentioned, but there is no link to it on the page.
- Data: several MRO instruments - HiRISE, CRISM, CTX, and also HRSC on Mars Express. Which one is the base is not stated.
- Credit: NASA/JPL-Caltech/ESA/University of Arizona/JHUAPL/MSSS/USGS Astrogeology Science Center.
- Files:
  - https://assets.science.nasa.gov/content/dam/science/psd/mars/resources/detail_files/2/22472_PIA23179-combo-rev_main.gif
  - https://assets.science.nasa.gov/content/dam/science/psd/mars/downloadable_items/4/42763_PIA23179-combo-rev_main.gif (GIF 1041 × 586, 2.86 MB)

**[not checked]** Which areas are labelled on the map (boxwork, the sulfate unit, etc.) - the text of the page does not name them, and the image was not viewed.

Usefulness:
- A **visual reference** for how NASA itself shows a route on Mount Sharp - useful for the map design and the slide.
- A **context slide** "where Curiosity is going" - with the credit as above.
- **Not data**: a 2019 route, "proposed", about 7 years out of date. Do not use it in calculations.

---

## 4. NASA Worldview

URL: https://worldview.earthdata.nasa.gov/

**[fact]** The page returned only the title "NASA Worldview" (15 characters); the interface is built by scripts.

**[inference, from general knowledge of the service]** Worldview is part of NASA Earthdata and shows satellite images of **Earth** through GIBS (near real time). There is no Mars data there.

Usefulness for MARSWALK: **none**. A possible use is only as an example of a "layers + time + legend" interface, if a UX reference is needed.

The link in the resource list is probably shared across several challenges rather than specific to ours.

---

## 5. Mars Perseverance Raw Images

URL: https://mars.nasa.gov/mars2020/multimedia/raw-images/

### 5.1. The resource itself

**[fact]** A gallery of raw images from the Perseverance rover (Jezero crater). The HTML is a shell with "Raw Image of the Week" and a "View More Images" button; the image grid is loaded by a script. An example image of the day: sol 1934, the SHERLOC camera (`shrlc`).

Usefulness: **none** - Jezero is not our area.

### 5.2. The Curiosity equivalent - an important finding

**[fact]** The Curiosity gallery page (`https://mars.nasa.gov/msl/multimedia/raw-images/`) is an almost empty shell. But behind it works an **open JSON API**:

```
https://mars.nasa.gov/api/v1/raw_image_items/
    ?order=sol%20desc
    &per_page=5
    &page=0
    &condition_1=msl:mission
```

**[fact]** The response:
- top level: `items`, `more`, `total`, `page`, `per_page`;
- `total` = 1,519,190 images;
- the latest sol: **5073** (`date_taken` 2026-11-13T15:17:38Z) - the rover is taking pictures right now;
- item fields: `id`, `camera_vector`, `site`, `imageid`, `subframe_rect`, `sol`, `scale_factor`, `camera_model_component_list`, `instrument`, `url`, `spacecraft_clock`, `attitude`, `camera_position`, `camera_model_type`, `drive`, `xyz`, `created_at`, `updated_at`, `mission`, `extended` (`lmst`, `bucket`, `mast_az`, `mast_el`, `url_list`, `contributor`, `filter_name`, `sample_type`), `date_taken`, `date_received`, `instrument_sort`, `sample_type_sort`, `is_thumbnail`, `title`, `description`, `link`, `image_credit`, `https_url`;
- the camera is in `instrument` (for example `MAHLI`), the image ID is in `imageid` (for example `5073MH0001530001900058S00_DXXX`), the credit is in `image_credit` (for example `NASA/JPL-Caltech/MSSS`).

### 5.3. What this means for us

- **R6** requires, for every target, a "Mastcam/Navcam image with ID + credit". The API gives exactly that: `imageid`, `instrument`, `sol`, `image_credit`, `https_url`.
- **[inference]** Through `site` and `drive`, images can be linked to the rover's position (the same fields are in the MMGIS waypoints: `site`, `drive`). This gives a "first-person view" next to each target.
- **[not checked]** The parameters for filtering by camera and by sol range (for example `condition_2=...`). They need to be worked out.
- Limitation: these are **raw** images. For slides and the UI, it is better to also have processed PIA images where they exist (for example PIA26696 from the boxwork context).
- Show the author credit verbatim from `image_credit`.

---

## 6. Additional sources found (not from the challenge list)

Found during the check; useful for R0 and R6.

| Source | URL | What it gives | Status |
|---|---|---|---|
| MMGIS: Curiosity's latest point | https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json | 1 point: sol 5073, 137.388886°E, −4.82602331°, plus site/drive/elevation/orientation | **[fact]** works |
| MMGIS: Curiosity's path | https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json | GeoJSON of path lines, ~1.36 MB, properties `Length` (m), coordinates `[lon, lat, elevation]` | **[fact]** exists; sol numbers are not visible in the properties |
| MMGIS: all waypoints | https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json | Presumably all points with sol | **[not checked]** |
| Curiosity raw images API | see section 5.2 | Images with ID, camera, sol, credit | **[fact]** works |
| Mars Trek catalog API | see section 1.2 | Product search, frames, metadata | **[fact]** works |

---

## 7. Conclusions for the team

1. Of the five challenge resources, only **one** is really useful to us - Mars Trek. One more (Perseverance) is useful indirectly - through the similar API for Curiosity.
2. Worldview is Earth and is not needed for Mars. The USGS geologic maps are at most a context layer.
3. For R0 there is now a **fallback DEM** (`Gale_DEM_SMG_1m`), and the rover's latest point is inside its frame. R0 is not closed by this - a real outline and all points from sol 4534 are needed (see `02-r0-coverage-gate.md`).
4. For R6 there is a ready Curiosity image API with credits - Alikhan can start choosing images for the targets now.
5. For Q11 (novelty against Trek) - Trek has layers of driven paths and profiles, but no EVA planner with a time budget, a point of no return and the provenance of the numbers. For the novelty slide this must be confirmed by opening the Trek interface in a browser.

## 8. What is left to check

- [ ] Open Mars Trek in a browser: the profile / path tools, the Slope and Hillshade layers for Gale
- [ ] The Trek tile format (`/tiles/Mars/EQ/<productLabel>/...`) and whether a DEM window can be downloaded
- [ ] The origin of `Gale_DEM_SMG_1m`: pure HiRISE or with CTX/HRSC gap filling
- [ ] The coordinate system `EPSG::104905` in Trek: sphere or ellipsoid
- [ ] `MSL_waypoints.json`: whether all points have a `sol` field
- [ ] Filters of the raw image API by camera (Mastcam/Navcam) and sol range
- [ ] The list of USGS geologic maps for Gale (open in a browser)
- [ ] Which areas are labelled on PIA23179
