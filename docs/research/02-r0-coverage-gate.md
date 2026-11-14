# R0 - AOI coverage gate

Date: 14 November 2026. Decision deadline: **day 1, 12:00**.
Owners: Alikhan + Aikyn.
Status: **R0 checked locally for issue #3: DTM 009149 chosen, 65/65 positions covered.**
The artifacts and the reproducible run are in section 0. Sections 1-6 below are kept as
the original research plan; their hypotheses and open items are not the final decision.

Marks: **[fact]** - checked by a query to the source; **[inference]** - interpretation; **[to check]** - needs confirmation.

---

## 0. Result of the check for issue #3 - 14 November 2026

**Decision: GALE-BX on `DTEEC_009149_1750_009294_1750_U01`.** We use the Curiosity
campaign site; moving to a remote boxwork is not needed.

| Check | DTM 001488 U02 | DTM 009149 U01 |
|---|---:|---:|
| Valid pixels | 67,903,999 | 72,772,639 |
| Curiosity positions inside the valid outline | **0 / 65** | **65 / 65** |
| Range of covered sols | none | 4534-4805 |
| Grid step, m | 1.0117467945795 | 1.0117467945795 |
| Sphere radius from PDS/GDAL, m | 3,396,190 | 3,396,190 |

**[fact]** Both full PDS3 `.IMG` files were downloaded and opened with Rasterio/GDAL. The polygon was built
at the native resolution from the mask of valid finite values; NoData, interior
holes and separate islands were kept. A bbox and a downsampled mask were not used.
The parts of the mask are merged on the integer pixel grid before projection, to avoid
false seams between read blocks.

**[fact]** From the NASA `MSL_waypoints.json`, all 65 available positions with
`4534 <= sol <= 4805` were selected, including both end dates. These are stop/drive
positions, not a daily time grid: missing sols were not interpolated.

**CRS.** The PDS labels of both DTMs state `PLANETOCENTRIC`, `EAST`, equirectangular
and identical axis radii. The GDAL metadata, the full WKT and the radii are saved in the report.
For MMGIS, a numeric check was made against the formulas of **PLACES SIS §4.4.2.4, pp. 33-34**:
`lat = northing / 3396190`, `lon = easting / 3396190` (radians → degrees).
The maximum residual over all 65 points is **0.003154 m**, the rejection threshold is 0.05 m.
This confirms the use of planetocentric latitude in this export;
checking against V1 ground landmarks remains a separate task.
The GeoJSON here holds **Martian** lon/lat; EPSG:4326 must not be assigned to it.

**Proposed AOI for #6:** the hull of the campaign positions with a 100 m buffer in the native
metric projection, intersected with the valid outline of the chosen DTM. The buffer is
an explicit assumption with a `source_tag`/`label`, not a safe-route radius.
The area centre of the resulting polygon is **`[137.3827764, -4.803166845]`**
(°E, planetocentric latitude), inside valid data. The previous median
rover position was replaced by the centre of the AOI geometry. The polygon covers all 65 positions.

**This boundary is preliminary:** its size of about 1.2 × 1.6 km describes the rover campaign
but does not guarantee coverage of future science targets and the habitat. The handoff explicitly states
`planning_ready: false`, `required_extent_inputs: ["R6 science targets", "D9 habitat"]`
and the requirement to recompute the boundary before turning on `/plan`. After R6/D9, **all**
approved targets and the habitat must be supplied as a GeoJSON FeatureCollection of Point features
with Martian `[lon_E, lat_planetocentric]`, keeping the provenance in properties:

```bash
python -m scripts.r0_coverage --planning-points data/planning/final_points.geojson --aoi-buffer-m 250
```

Here 250 m is an example of an explicitly chosen margin, not a scientifically confirmed norm.
The script builds a common hull of the rover positions, targets and habitat, adds the given margin,
recomputes the centre and the local CRS, and saves a copy of the input planning points and their SHA-256.
A point outside the valid DTM causes a refusal with an explanation: it cannot be silently clipped by the boundary.
After that, R1/Q6 must check coverage, artifacts, slopes and the suitability of the habitat;
the readiness of `/plan` is confirmed in the runtime Region Config of task #6. The R0 flag now
shows a separate checkable state: whether there is a review record for **this** AOI
with **these** points and DTM, suitable for import into #6.

To get `planning_ready: true`, first run the calculation with the final
points; their properties must contain the roles `habitat` and `target`. After the
R6/D9 check and terrain QA, prepare `data/planning/approval.json` in the form below.
The hashes are taken from the `aoi_proposal` of the resulting handoff; the reviewer's name, the date and the links
to real QA results must be filled in according to the actual check:

```json
{
  "schema": "ares.r0-planning-approval/v1",
  "reviewer": "<reviewer>",
  "reviewed_on": "2026-11-14",
  "evidence": ["<link to the R6/D9 and terrain QA results>"],
  "extent_sha256": "<aoi_proposal.extent_sha256>",
  "planning_points_sha256": "<aoi_proposal.planning_points_sha256>",
  "checks": {
    "r6_targets_finalized": true,
    "d9_habitat_finalized": true,
    "terrain_qa_passed": true
  }
}
```

```bash
python -m scripts.r0_coverage --planning-points data/planning/final_points.geojson --aoi-buffer-m 250 --planning-approval data/planning/approval.json
```

The accepted review record is saved in the handoff and in `OUTPUT/planning_approval.json`.
`extent_sha256` is tied to the geometry, the buffer, the working/native CRS, the grid step,
the ID and SHA-256 of the DTM, and the hash of the points file. Changing these inputs makes the old
approval inapplicable: a new review is required. Without the review file, the flag
stays false. This is a record of the review provided, not an automatic certification
of the terrain and not permission for a real EVA. The current handoff has no approval:
R6/D9 and terrain QA are not finished yet.

The data is passed in [`gale_bx_handoff.json`](r0/gale_bx_handoff.json) with the explicit
format `ares.r0-handoff/v1`: `aoi_proposal` holds `aoi_geojson`, `centre_lonlat_E`
and `crs_proj`; `dtm_product_id`, `native_dtm` and `coverage_evidence` are recorded separately.
The working projection is a local eqc with **`lat_ts`, `lat_0`, `lon_0` at the AOI centre**,
a radius of 3396190 m from the product and the standard `+no_defs`. The original DTM projection
with `lat_ts=0` stays only in `native_dtm` and in the source metadata.

The handoff has its own format and is not loaded as a runtime Region Config.
The incomplete draft `backend/data/gale_bx.json` was removed: it might not pass the future
Pydantic model of #6 (`targets` must refer to a file; layers/parameters need
their own contract). In #6 the verified fields from the handoff should be moved explicitly,
creating a full Region Config per the specification and filling in the habitat, layers, targets
and parameters. The R0 script no longer reads or overwrites the runtime config.

Artifacts:

- [Overlay of outlines and positions](r0/r0_overlay.png).
- [Machine report with URLs, input SHA-256s, CRS and results](r0/r0_result.json).
- [Separate handoff for the Region Config in #6](r0/gale_bx_handoff.json).
- [Sample of positions, sols 4534-4805](r0/rover_sols4534-4805.geojson).
- [Valid outline of 001488](r0/DTEEC_001488_1750_001752_1750_U02_footprint.geojson).
- [Valid outline of 009149](r0/DTEEC_009149_1750_009294_1750_U01_footprint.geojson).

Reproduction from the repository root (Python 3.10+, separate GIS dependencies):

```bash
python -m pip install -r scripts/requirements-r0.txt
python -m scripts.r0_coverage --download
python -m pytest scripts/tests -q
python -m ruff check scripts/r0_*.py scripts/tests
```

The first run downloads ~751 MB of rasters into the ignored `data/r0/raw/`. A repeated
run without `--download` works offline. The expected sizes and the **pinned SHA-256s**
are set in [`scripts/r0_inputs.json`](../../scripts/r0_inputs.json). The positions come
from the versioned snapshot [`r0_waypoints.geojson`](../../scripts/data/r0_waypoints.geojson),
not from the changing multi-year NASA catalog. The original export from which the sample was
taken: SHA-256 `5a32324f4b8ba22ebdfac50a503e195f47ccdc876ad4c15b19e29dc7cef15a09`,
665,124 bytes, checked on 14 November 2026. Downloading it again for reproduction is not needed.
Changing the pinned inputs requires an explicit change of the manifest in Git.

In the `provenance` of the snapshot record in the manifest, the download date **2026-11-14**
(the exact time was not recorded), the SHA-256/size of the full source, the inclusive
filter `sol ∈ [4534, 4805]`, the stable sort by sol and the serialization format are stored.
The full properties and geometry of the selected features are kept without interpolation.
The recreate command from the manifest also works on a fresh checkout: it fetches the NASA
catalog itself and saves the matching sample. After the first run the saved
catalog is available for offline recreation:

```bash
python -m scripts.r0_snapshot --download --output data/r0/raw/r0_waypoints_recreated.geojson
python -m scripts.r0_snapshot --source data/r0/raw/MSL_waypoints_verify.json --output data/r0/raw/r0_waypoints_recreated.geojson
```

The first command downloads the **current** NASA catalog, repeats the same selection and compares
the resulting bytes with the pinned snapshot. Updates outside the campaign do not change the sample;
a change of the selected features gives an error with the expected and the actual hash, without replacing the snapshot.
The full hash of the current export is also printed for comparison with the original source.
Both modes were checked: the 65 positions and the snapshot matched byte for byte; the current full export of
NASA also matched the original one by SHA-256.

`r0_snapshot.py` and the shared selection in `r0_waypoints.py` use only the Python standard
library: downloading and checking the JSON needs no requests, NumPy,
Rasterio/GDAL, Shapely or Matplotlib. This was checked by running the CLI with `python -S`,
when installed site-packages are unavailable.

The hash of new downloads is computed once over the decompressed stream. `Content-Length`
is checked only for uncompressed responses; for gzip, the pinned size
and SHA-256 of the **decompressed** bytes are checked. A mismatch does not replace the accepted file.
For the cache, `.verified.json` is saved with the verified hash, size, inode,
mtime/ctime in nanoseconds. An unchanged local cache is not re-read
for hashing; a change of the metadata or of the pinned hash requires a new check.
The waypoints snapshot is small and is hashed on every run. The cache check records are meant
for ordinary local storage; after moving from untrusted storage, all bytes can be
checked by force: `python -m scripts.r0_coverage --verify-inputs`.

If the cache is damaged, the message contains the raster path, the path of its `.verified.json`
and the recovery command: `python -m scripts.r0_coverage --download --verify-inputs`
(add the same `--raw` if the cache is in another directory). In this mode a damaged
file is downloaded again and replaced only after the pinned size
and SHA-256 are verified. An alternative: delete the named raster **and** its `.verified.json`, then
repeat the run with `--download`. If the archive itself serves other bytes, the automatic
recovery ends with a separate `SourceMismatchError` and does not change the pins.
A local cache error has the type `CacheIntegrityError`; a full server response
that does not match the pin is a different case. It may mean a reissue of the product
or a difference in the transferred content; by itself it does not prove cache damage.

After such a response, `RASTER.IMG.source-mismatch.json` is saved with the URL,
the expected and actual hashes/sizes. Later runs with the same URL and pin
**do not download hundreds of megabytes again**. After the cause is investigated, you can explicitly
retry: `python -m scripts.r0_coverage --download --retry-source`.
A URL/pin changed after review also allows a new download; a successful check
removes the refusal record. Network errors and incomplete transfers are not blocked in this
way - only a fully received response that does not match the pinned input.

The parameters `--raw`, `--output`, `--handoff` set other paths. By default the handoff
is next to the report: `OUTPUT/gale_bx_handoff.json`. `coverage_evidence` is a path
**relative to the handoff directory**, even with an absolute `--output`; local absolute
machine paths are not recorded. If there is no fully covering DTM, the report contains
`unresolved`, the centre is `null`, and the CLI exit code is 2; partial coverage is not accepted.
An already accepted handoff is kept in this case, and the runtime config is not touched.
On a successful regular run without `--planning-points`, the old export
`OUTPUT/planning_points.geojson` is deleted and `planning_points_count` becomes 0.
Without `--planning-approval`, the old review export is also deleted and
`planning_ready` is reset. The user's source files outside the export directory are kept;
on a refusal, the old accepted handoff inputs are not deleted.

After review, checks were added for gzip on a local HTTP server, pinned inputs,
a changed and an unchanged cache, a forced audit, a refusal without overwriting data,
an absolute output path, a third DTM, invalid sols outside the campaign and the metric
scale of the local projection. Also checked: the snapshot recipe, the refusal on
a change of the campaign, automatic cache recovery and the AOI expansion to targets
off the route. Also checked: cleanup of stale exports, the readiness switching to true
with a bound review, rejection of a stale review, blocking repeated downloads of
a changed source and the JSON check working without site-packages. In total **34 tests**.

R0 confirms the **geometric coverage of the available positions and of the proposed AOI**. Checks of DTM
artifacts, slopes, registration accuracy and the suitability of the habitat site remain for R1/Q6.
This is not a full L4 attestation. Checking the MSL DEM, the CTX fill and the Siebach fallback was not needed
for this decision: the separate stereo DTM 009149 covers the whole sample.

Primary sources:

- [HiRISE: main DTM 001488](https://www.uahirise.org/dtm/dtm.php?ID=PSP_001488_1750).
- [HiRISE: chosen DTM 009149](https://www.uahirise.org/dtm/dtm.php?ID=PSP_009149_1750).
- [NASA MMGIS: full list of waypoints](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json).
- [PLACES SIS: coordinate formulas](https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/document/PLACES_PDS_SIS.pdf).

---

## 1. What R0 is and why it comes first

The wording from the context:

> AOI coverage gate - first task, before route code. DTM footprint (`gdalinfo` / USGS STAC) overlaid with Curiosity positions sols 4534+. Overlap → GALE-BX confirmed; no overlap → search STAC for another DTM; else use the DTM's own boxwork and say so on the slide. Decision by Day 1, 12:00.

There is one question: **does our 1 m terrain model cover the boxwork site where Curiosity works in 2025-26 (sol 4534 onwards)?**

Why everything else waits for R0:
- R1 (the layer stack) - without a known DTM there is nothing to clip and show.
- Q6 (the habitat location) - the habitat is placed in a covered zone.
- R3 (the route) - A* works on the DTM grid.
- The demo by the checklist starts with the proof of R0.

If R0 is skipped and route writing starts, a day can be spent on terrain that does not match the place the pitch will be about.

---

## 2. Input data

### 2.1. Terrain model (what we overlay)

| Candidate | From where | Status |
|---|---|---|
| **A.** HiRISE DTM `DTEEC_001488_1750_001752_1750_U02` | Named in the context as the main one | Outline not obtained. z from −4485.57 to −2977.08 m (from the context) |
| **B.** "MRO HiRISE, Gale Crater DEM", `Gale_DEM_SMG_1m` | The Mars Trek catalog | **[fact]** Frame 137.1224711…137.7298129°E, −4.9254743…−4.2489631°. ~5.8 GB, created 2020-06-25 |
| **C.** Other HiRISE DTMs of Mount Sharp | USGS STAC / the HiRISE site (uahirise.org/dtm) | Not searched |
| **D.** MSL 1 m DEM mosaic | Named in the context as "Optional fill" | **[inference]** Probably the same as candidate B. A 1 m grid, but part may be filled in by CTX/HRSC |

**[inference] about candidate A.** HiRISE image names like `PSP_001488_1750` / `PSP_001752_1750` belong to the primary science phase of MRO (2006-07). At that time Gale was imaged mostly to choose the MSL landing site. There is a noticeable chance that this DTM covers the landing area (Bradbury), not the site on the slope of Mount Sharp where the rover is now. This is a hypothesis, and R0 checks it.

### 2.2. Rover positions (what we compare with)

| Source | What it gives | Status |
|---|---|---|
| MSL PLACES, doi:10.17189/1520397 | Official localizations in PDS | The main one per the context. Not downloaded |
| `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json` | One latest point | **[fact]** sol 5073, lon 137.388886, lat −4.82602331. Fields: RMC, site, drive, sol, easting, northing, elev_geoid, lon, lat, roll, pitch, yaw, yaw_rad, tilt, dist_m, dist_total_m, dist_km, dist_mi, drive_type |
| `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` | Probably all waypoints with sol | Not requested **[to check]** |
| `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json` | The path line, ~1.36 MB GeoJSON | **[fact]** Exists. Features: FeatureCollection, the features have a `Length` property (m), LineString/MultiLineString geometry, coordinates `[lon, lat, elevation]`. **Sol numbers are not visible in the properties**, so "sol 4534+" cannot be selected from it directly |

**[inference]** For a filter by sol, we need either `MSL_waypoints.json` (if it has a `sol` field for all points), or PLACES. `MSL_traverse.json` is good as a picture of the path and for checking "the line is inside the coverage".

---

## 3. Step-by-step check plan

### Step 1. Get the outline of candidate A

Options in decreasing order of speed:

1. The **PDS label `.LBL`** next to the DTM on the HiRISE site. The needed fields:
   - `MINIMUM_LATITUDE`, `MAXIMUM_LATITUDE`;
   - `EASTERNMOST_LONGITUDE`, `WESTERNMOST_LONGITUDE`;
   - `A_AXIS_RADIUS` / `B_AXIS_RADIUS` / `C_AXIS_RADIUS` (the radius - read from the label, a rule of the context);
   - `MAP_PROJECTION_TYPE` (usually EQUIRECTANGULAR), `CENTER_LATITUDE`;
   - `COORDINATE_SYSTEM_NAME` (we expect PLANETOCENTRIC).
2. **GDAL** on the `.IMG` itself:
   ```bash
   gdalinfo -json DTEEC_001488_1750_001752_1750_U02.IMG
   ```
   Look at `wgs84Extent` (on Mars it is just a lon/lat outline), `coordinateSystem`, `noDataValue`.
3. **USGS STAC** (stac.astrogeology.usgs.gov): find the HiRISE DTM collection, then the item by ID and take its `geometry`. A plus: it is a real polygon, not a frame.

Important: a frame (bbox) ≠ coverage. A HiRISE DTM is a narrow strip, often tilted, and inside the frame there is a lot of nodata. For an honest R0 we need the **outline of valid pixels**: `gdal_polygonize` on the mask `!= nodata`, or the geometry from STAC.

### Step 2. Get the outline of candidate B (Trek)

The Trek catalog gives only a frame. For a real outline:
- download a reduced version / the tiles from `https://trek.nasa.gov/tiles/Mars/EQ/Gale_DEM_SMG_1m/` **[check the URL format]** and build a coverage mask;
- or find the same mosaic in PDS / USGS and take its label.

Separately find out whether this mosaic has CTX/HRSC gap filling. If it does, the UI must say "1 m grid ≠ 1 m data" (a rule of the context).

### Step 3. Get the rover positions from sol 4534

1. Try `MSL_waypoints.json`; filter `sol >= 4534`.
2. If there is no `sol` field or the file is unavailable - PLACES (PDS Geosciences).
3. Save the sample in `data/r0/rover_sol4534plus.geojson` with a `source_url` field and the download date.

### Step 4. Check the coordinate system

Before any overlay:
- HiRISE DTM: usually planetocentric latitudes, east longitude 0-360, a sphere with the radius from the label.
- MMGIS / PLACES: **[to check]** which latitude (ocentric/ographic) and which longitude.
- The Trek catalog: `proj=urn:ogc:def:crs:EPSG::104905`. This is the ESRI code for Mars 2000; **[to check]** whether it is a sphere or an ellipsoid. The context recommends ESRI:104971 `Mars_2000_(Sphere)` or `IAU_2015:49900`.

Why this matters: the context warns that planetographic CRSs shift points by up to ~10 km. That is more than our whole zone.

### Step 5. Overlay

Python, the minimum:

```python
# A sketch. Clarify paths and fields against the real files.
import json, shapely.geometry as sg
footprint = sg.shape(json.load(open("dtm_footprint.geojson"))["features"][0]["geometry"])
pts = [f for f in json.load(open("rover_sol4534plus.geojson"))["features"]]
inside = [p for p in pts if footprint.contains(sg.shape(p["geometry"]))]
result = {
    "dtm_id": "...",
    "n_points": len(pts),
    "n_inside": len(inside),
    "sol_range_inside": [min(p["properties"]["sol"] for p in inside),
                         max(p["properties"]["sol"] for p in inside)] if inside else None,
}
```

Or QGIS: an outline layer + a points layer, the project CRS `IAU_2015:49900`, "Select by location".

### Step 6. Decision

| Result | Decision | What we write |
|---|---|---|
| The 2025-26 points are inside the valid outline of A | `GALE-BX` confirmed on A | "DTM A covers N of M rover positions sols X-Y" |
| A does not cover, B covers (and it is HiRISE, not CTX) | `GALE-BX` on B | The same + a note on the origin of the mosaic |
| B covers, but only with CTX fill | `GALE-BX` on B with the flag "1 m grid ≠ 1 m data" | Explicitly on the slide and in the UI |
| Neither A, nor B, nor STAC | We use the boxwork that is visible on A | Slide: "not the 2025-26 rover site" |

### Step 7. Proof for the demo

Save in `data/r0/`:
- `r0_result.json` - the product ID, the outline (source), the number of points, how many are inside, the sol range, the CRS of both layers, the check time, the final decision;
- `r0_overlay.png` - a picture: the DTM outline + the rover points + the AOI frame;
- links to all source URLs.

This closes the first item of the pre-demo checklist: "Demo starts in GALE-BX and shows the R0 coverage proof".

---

## 4. What is already known (at the time of writing)

**[fact]** Curiosity's latest position: sol 5073, **137.388886°E, −4.82602331°** (MMGIS, `MSL_waypoints_current.json`).

**[fact]** The frame of `Gale_DEM_SMG_1m` (Trek): 137.1224711…137.7298129°E, −4.9254743…−4.2489631°.

Comparison:
- 137.3889 lies inside 137.1225…137.7298 - yes;
- −4.8260 lies inside −4.9255…−4.2490 - yes, about 0.1° (~6 km) from the southern edge.

**[fact]** The same point lies inside the narrow fallback search frame from the context (137.2-137.6°E, −5.1…−4.6°).

**[inference]** The rover is most likely in the zone of candidate B. This does **not** close R0, because:
1. this is a frame, not an outline of valid pixels;
2. one point (sol 5073) was checked, not the whole site from sol 4534;
3. the latitude systems of MMGIS and Trek were not compared;
4. candidate A (the main DTM from the context) was not checked at all;
5. it is unknown whether this is HiRISE near the rover or CTX fill.

**[inference]** The rover is now at sol 5073, while the context speaks of "sol 4534+" and the Nevado Sajama drilling at sol 4718. Over ~540 sols the rover could have driven several kilometres. We need to check that the **whole** 2025-26 site falls inside the coverage, not only the last point. For the demo, the most important are the drilling points (Altadena, Valle de la Luna, Nevado Sajama) - their coordinates should be found separately.

---

## 5. Risks

| Risk | Probability | What we do |
|---|---|---|
| A does not cover the rover's site | Noticeable (see 2.1) | We switch to B or another DTM from STAC |
| B is 5.8 GB, slow to download | High | Download only the AOI window (through tiles/COG/`gdal_translate -projwin` on the remote file, if the server supports range requests) |
| B contains CTX fill near the rover | Medium | A flag in the UI; mark slopes there as coarse |
| Different latitude systems | Medium | Step 4 is mandatory; check on a known point (for example the Bradbury landing site) |
| We miss 12:00 | Medium | A decision on the best data + an honest note on the slide, as R0 itself allows |

---

## 6. R0 checklist

- [ ] The valid-pixel outline of DTM A (label / gdalinfo / STAC)
- [ ] The outline or coverage mask of DEM B (Trek)
- [ ] A STAC search for other HiRISE DTMs in the frame 137.2-137.6°E, −5.1…−4.6°
- [ ] Rover positions sol ≥ 4534 with a sol field
- [ ] The coordinate systems of all sources are recorded and compared
- [ ] The overlay, counting the points inside
- [ ] The coordinates of the drilling points Altadena, Valle de la Luna, Nevado Sajama are checked for coverage
- [ ] `r0_result.json` + `r0_overlay.png` are saved
- [ ] The decision is recorded and told to the team before 12:00
