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
python scripts/make_slope_grid.py data/r0/raw/DTEEC_009149_1750_009294_1750_U01.IMG
```

The DTM was already found locally at the path above. If it is missing in
another checkout, download the original from the URL in `scripts/r0_inputs.json`:

```powershell
New-Item -ItemType Directory -Force data/r0/raw | Out-Null
curl.exe --fail --location --retry 3 --output data/r0/raw/DTEEC_009149_1750_009294_1750_U01.IMG https://www.uahirise.org/PDS/DTM/PSP/ORB_009100_009199/PSP_009149_1750_PSP_009294_1750/DTEEC_009149_1750_009294_1750_U01.IMG
```

Both generators accept `--cell` (1 m by default), `--handoff` (by default
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
nearest odd window of about 5 m (5×5 cells at 1 m, 3×3 at 2 m), followed by the
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
primary sources and replace the temporary names `Curiosity sol N` and the notes
with confirmed science descriptions; if coordinates change, re-check the bbox,
slope and connectivity with the tests. Until this check, the labels stay the
actual sol numbers and references to the route snapshot.

The overall limit is 3,000,000 bytes for both folders, including existing extra
files such as `stops.json` and `assumptions.json`. `RESERVE_BYTES = 100_000`
bytes are reserved for them: the grid itself (two copies of meta.json, the
binary arrays and two PNGs) must take no more than 2,900,000 bytes. If either
limit is exceeded, the generator reports it and repeats the calculation with
`--cell 2`. If the limit is still exceeded, it exits with an error before
writing results. It does not create or change the extra files.

The AOI in the handoff is preliminary. Generating the grid does not confirm
that the site is suitable for planning; `preliminary` stays `true`.
