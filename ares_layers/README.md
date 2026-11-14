# ARES map layers

Small Python pipeline that turns archived NASA data into map layers for the ARES EVA planner
(NASA Space Apps 2026, "Interplanetary Survival Guide: Martian Map"). AOI: Mount Sharp boxwork (GALE-BX).

## Install
```
pip install rasterio pyproj numpy pillow requests pytest
```
The rasterio wheels include the GDAL drivers we need (PDS, ISIS3, JP2OpenJPEG, COG). Check with
`python -c "import rasterio; print(sorted(rasterio.drivers.raster_driver_extensions()))"`.

## Data (download manually, put here)
| file | path | source |
|---|---|---|
| HiRISE DTM `DTEEC_009149_1750_009294_1750_U01.IMG` | `data/dtm/` | HiRISE PDS / uahirise.org |
| HiRISE ortho `PSP_009149_1750_RED_A_01_ORTHO.JP2` | `data/ortho/` | same DTM page |
| THEMIS quantitative TI mosaic, tile 30S120E (.cub, 100 m/px) | `data/themis/` (set exact name in `config.py`) | USGS Astrogeology |

## Run
```
./run_all.sh              # real data -> out/
./run_all.sh synthetic    # SYNTHETIC test data -> out_synthetic/ (never use in the pitch)
python -m pytest -q tests # unit tests only
```
Single steps: `python make_slope.py`, `make_optical.py`, `make_thermal.py`, `check_location.py [stops.csv|.geojson]`,
`radiation_card.py 4 6` (EVA hours), `fetch_donki.py` (`NASA_API_KEY=...` optional, default DEMO_KEY).

## Outputs (`out/`)
| file | what | status |
|---|---|---|
| `slope.tif/.png/.json`, `hillshade_1m.png` | slope (deg) at ~5.06 m, Horn 1981; classes <=10/10-15/15-20/>20, NoData grey | MODEL from archived DTM |
| `optical.png/.json` | HiRISE ortho, 0.5 m, 8-bit stretch, same box as slope | ARCHIVED image |
| `thermal_ti.tif/.png/.json`, `thermal_ti_colorbar.png` | thermal inertia (not temperature), native 100 m values | ARCHIVED mosaic |
| `radiation.json` | 0.64 +/- 0.12 mSv/day and EVA dose arithmetic | PUBLISHED MEAN, not live |
| `advisory.json` | DONKI flares/SEP/CME, last 7 days | LIVE event catalogue, not a dose at Mars |
| `stops_check.json` | rover stops: in AOI, row/col, elevation vs anchor | CHECK |

Every PNG has a JSON with `bounds_latlon` = `[[south, west], [north, east]]` for an image overlay
(`L.imageOverlay(png, bounds)`). Grids are equidistant cylindrical, i.e. linear in lat/lon, so the
overlay is exact in a plate-carree map and visually exact in Web Mercator over this 2 km box.

## Key choices
- Lat/lon is converted on the DTM's own Mars sphere (R = 3396190 m), never WGS84.
- Slope thresholds 10/15/20 deg are **lunar analogs [R]** (15 deg: Pena-Asensio 2024; 20 deg: NASA EVA-EXP-0075 design case; 10 deg is only a display break, unsourced),
  derived on 5 m data -> we aggregate to 5 m before computing slope.
- No DTM artifact / FOM mask yet: inspect `hillshade_1m.png` before trusting steep cells.

## Credits
HiRISE DTM and ortho: NASA/JPL-Caltech/UArizona. THEMIS TI: Fergason et al. 2006 / USGS Astrogeology /
NASA/JPL-Caltech/ASU. Space weather: NASA CCMC DONKI. Radiation: Hassler et al. 2014, Science 343,
doi:10.1126/science.1244797. Slope method: Horn 1981, Proc. IEEE 69(1).

## Weather card (Mars Climate Database) and Mars date
- `mars_time.py` — today's Ls (Allison & McEwen 2000; test reproduces the paper's example to 1e-3 deg).
- `fetch_mcd.py` — once a day: today's Ls -> MCD v6.2 ASCII for our site -> `out/weather.json`
  (label "Model climatology for today's season ... Not a forecast"). Set `MCD_URL_TEMPLATE`
  (ASCII-download URL from one browser query, Ls replaced by `{ls}`). Falls back to the newest
  cached file, incl. `data_samples/mcd_ls22.3_lat-4.8_lon137.38.txt` (real query, 15 Nov 2026).
- Do not query the LMD server more than ~once a day.
