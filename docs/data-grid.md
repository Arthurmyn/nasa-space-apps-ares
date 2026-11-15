# Generating the Gale boxwork grid

File format: [DATA_CONTRACT.md](DATA_CONTRACT.md). Run from the repository root:

```powershell
python -m pip install -r scripts/requirements-grid.txt
python scripts/make_fake_grid.py --output-root "$env:TEMP/ares-fake-grid"
python -m pytest scripts/tests -q
```

The test generator creates an inclined plane, two hills and a ravine that
gradually shallows to the north. The western and eastern edges are connected
through cells with a slope of at most 15° (8 neighbours). The metadata has
`is_test_data: true`, and the source is explicitly marked as synthetic. The
committed files in `backend/data/gale-bx/` and `frontend/public/data/gale-bx/`
are the real grid from the HiRISE DTM `DTEEC_009149_1750_009294_1750_U01`,
`is_test_data: false`. The tests generate the synthetic grid only in `tmp_path`.
The current grid size and cell size are in `meta.json`. The generator prints
the total file size after writing, and pytest prints the result and the number
of tests for the current version. The values of a specific run are recorded in
the PR description.

Generating from the real DTM (this replaces the files):

```powershell
python scripts/make_slope_grid.py data/r0/raw/DTEEC_009149_1750_009294_1750_U01.IMG --cell 4
```

The committed Gale grid is 526 x 736 cells of 4 m (about 2.1 x 2.9 km) around the centre
137.3873 E, -4.79575 N. The AOI in `docs/research/r0/gale_bx_handoff.json` was made larger with
`python -m scripts.enlarge_aoi --width-m 2500 --height-m 3500 --dtm data/r0/raw/DTEEC_009149_1750_009294_1750_U01.IMG`:
the centre stays (so the Curiosity stops stay inside), the footprint of valid DTM pixels is read with
`scripts.r0_coverage` (and checked against the committed `..._footprint.geojson`), and the rectangle
is cut down to the largest one of the same 5:7 shape that lies at least 20 m inside that footprint.
2.5 x 3.5 km does not fit: the centre is only 1267 m from the footprint's western edge, and the footprint
narrows towards the north and south, so the largest rectangle is 2100 x 2944 m (the script's report
lists the four distances). The grid snaps it outwards to whole cells, which gives 2104 x 2944 m.

Everything that depends on the bbox is made again after the grid, in this order (the backend ignores
a `thermal.json`, `geology.json` or `validation.json` whose bbox, or for validation whose
`elevation.bin`, is not the grid's):

```powershell
python -m scripts.make_thermal_layer data/r0/raw/gale_crater_themis_dayir_isis.cub
python -m scripts.make_optical_layer data/r0/raw/PSP_009149_1750_RED_C_01_ORTHO.JP2
python -m scripts.make_geology
python -m scripts.fetch_traverse
python -m scripts.validate_traverse
python -m scripts.bench_route
```

The last one times `POST /api/v1/route` and measures the backend's memory.

The DTM was already found locally at the path above. If it is missing in
another checkout, download the original from the URL in `scripts/r0_inputs.json`:

```powershell
New-Item -ItemType Directory -Force data/r0/raw | Out-Null
curl.exe --fail --location --retry 3 --output data/r0/raw/DTEEC_009149_1750_009294_1750_U01.IMG https://www.uahirise.org/PDS/DTM/PSP/ORB_009100_009199/PSP_009149_1750_PSP_009294_1750/DTEEC_009149_1750_009294_1750_U01.IMG
```

Both generators accept `--cell` (1 m by default; Gale uses 4 m), `--handoff` (by default
`docs/research/r0/gale_bx_handoff.json`) and `--output-root` (by default the
repository root). The last parameter lets you check synthetic or real data
separately without replacing the committed files. GeoTIFF and PDS IMG with a
specified CRS are supported.

The grid covers the AOI, rounded outwards to whole cells. `bbox` matches the
outer edges of the finished grid, so it can be slightly wider than the AOI. The
coordinates in the contract formulas are cell-edge coordinates; indexing uses
`floor`. The centre of a cell is at `(col + 0.5, row + 0.5)`. The eastern and
southern edges are excluded when indexing. Cells whose centre is outside the AOI
polygon get NoData. The projection uses the Mars sphere with a radius of
3396190 m, without EPSG:4326.

Elevations are reprojected bilinearly. For slope, an average is taken over the
nearest odd window of about 5 m (5×5 cells at 1 m, 3×3 at 2 m, none at 3 m and 4 m), followed by the
gradient and `atan(hypot(dx, dy))`. Quantization: `round(deg / 0.5)`, with halves
rounded to the nearest even number. The window and the gradient neighbours must
contain only valid elevations: gaps are not filled. At the outer edge, the
nearest elevation is extended. Slope there is less accurate than inside the
grid. NoData: NaN for elevations, 255 for slopes; PNGs are transparent where
slope is missing. The hillshade is lit from the north-west: azimuth 315°,
altitude 45°. One smoothed gradient is used for both slope and hillshade.
PNG colours: green up to `slope_caution_deg`, yellow up to `slope_limit_deg`,
red above the limit. The thresholds are read from
`backend/data/gale-bx/assumptions.json` in the output folder; if the file is
missing, 10° and 15° are used.

`stops.json` holds Curiosity points from
`docs/research/r0/rover_sols4534-4805.geojson` in the `boxwork` group.
These are points from a snapshot of the rover's route, not confirmed science
targets. `source_id: src-msl-traverse` refers to the registry
`backend/data/gale-bx/sources.json` with the URL of the original MSL waypoints
and the path of the snapshot. The generator copies only the sources of the
current targets into `meta.sources`. When targets are replaced, `stops.json` and
the registry are updated; the generator code does not need to change. The
registry counts towards the total size.
All points are inside the bbox, on cells no steeper than 15°, and in one
connected region over 8 neighbours. pytest checks this against the committed
`slope.bin`.
`assumptions.json` sets the 10°/15° limits and the 2 km/h speed; the sources of
these assumptions are given explicitly, with references `[1]`-`[4]` to NASA and
JPL documents (the list is in `frontend/src/config/references.ts`). For the 10°
threshold and the 15° limit, these are ARES planning values, not an official
standard for a human on Mars.

A task for Alikhan before the science targets are used: check them against the
primary sources and replace the neutral names `Boxwork traverse point, sol N` and the notes
with confirmed science descriptions; if coordinates change, re-check the bbox,
slope and connectivity with the tests. Until this check, the labels stay the
actual sol numbers and references to the route snapshot.

There are two size budgets, separate because the two folders are used differently.
`BROWSER_MAX_BYTES = 3_000_000` counts what the browser downloads: everything in
`frontend/public/data/<site>/` (meta.json, slope.bin, the PNG layers and the extra
files such as `stops.json`, `thermal.json`), without the HUD's copy of `elevation.bin`.
`RESERVE_BYTES = 100_000` of it is kept free for the extra files, so the generated browser
files (meta.json, slope.bin, hillshade.png, slope.png) must take no more than 2,900,000 bytes.
`BACKEND_MAX_BYTES = 12_000_000` counts `backend/data/<site>/`: the backend reads those files
once, when it starts, and never sends them, so `elevation.bin` (4 bytes per cell) may be large.
If either limit is exceeded, the generator reports which and repeats the calculation with
`--cell 2`, then 3, 4 and 5. If the limit is still exceeded, it exits with an error before
writing results. It does not create or change the extra files. The grid file formats are
the ones of `docs/DATA_CONTRACT.md`; only the budget check changed.

The AOI in the handoff is preliminary. Generating the grid does not confirm
that the site is suitable for planning; `preliminary` stays `true`.

**Route time and memory** (`python -m scripts.bench_route`, an Apple-silicon laptop, one run each,
through the real FastAPI app). The 3 m grid of 438 x 616 cells against the 4 m grid of 526 x 736 cells:

| | before (3 m, 269,808 cells) | after (4 m, 387,136 cells) |
|---|---|---|
| `POST /route`, the Boxwork group (5 stops) | 0.3 s | 0.2 to 0.3 s |
| `POST /route`, across the area (the two farthest passable cells) | 0.6 s, 2.3 km | 1.0 to 1.3 s, 4.0 km |
| backend memory, idle | 85 MB | 87 MB |
| backend memory after the first Boxwork route | 351 MB | 294 MB |
| backend memory after the longest route | about 850 MB | about 700 MB |

The memory is mostly the hazard zones: the first route builds the steep-slope regions of the whole grid
in Python lists and keeps them cached. It is a cost per cell, so it grows with the area, not with the
route length. Both routes stay well under the 3 s limit.

