# BUILD_NOTES (14 Nov 2026)

Environment: Python 3, rasterio 1.5.2 (GDAL 3.12.2, drivers PDS / ISIS3 / JP2OpenJPEG / COG present), pyproj 3.8.0.

## Tested (all on SYNTHETIC data, `./run_all.sh synthetic`, exit 0, 12/12 pytest green)
- (a) Horn slope on 12 deg planes (x, y, diagonal): 12 +/- 0.1 deg in interior; borders NoData.
- (b) flat plane -> 0 deg.
- (c) one masked pixel -> its 5x5 block NoData -> that cell + 8 neighbours NoData; class -1.
  This test found a bug (Horn ignores the centre cell, so a NoData cell got a slope); fixed.
- Class boundaries: 10 -> class 0, 10.01 -> 1, 20 -> 2, 20.5 -> 3.
- (d) lat/lon -> x/y -> row/col for the 3 rover stops equals the hand formula
  x = R(lon-137.41)pi/180, y = R lat pi/180 with the real origin/pixel to < 1e-6 m / px; round trip < 1e-9 deg;
  stops fall at real-grid row ~7723, col ~1621 (inside 14466 x 6749). Axis swap is detected.
- (e) dose: 24 h -> 0.64 +/- 0.12; 6 h -> 0.16 +/- 0.03 mSv; negative duration rejected.
- DONKI summariser on a fake event (offline).
- End-to-end: synthetic DTM is a pixel-aligned sub-window of the real grid (offset row 5599, col 845);
  6 deg synthetic plane -> slope median 6.000 deg; slope/optical/thermal bounds agree (optical within 0.5 m);
  ortho warped from a different grid (0.5 m, lon_0 = 137.39); TI clipped from a lon_0 = 0, 100 m grid;
  COG writing works; images visually checked (north-up, hillshade lit from NW).

## Not tested here
- Real files (DTM .IMG, ortho .JP2, THEMIS .cub): not downloadable in the sandbox. First real run must check
  `slope.json` resolution (~5.06 m), that no "grid differs from config" warning appears, and `stops_check.json`.
- Elevation anchor -3620 +/- 50 m: values on synthetic data are fake, so the flag fired as expected; the anchor
  itself (Siebach & Grotzinger 2014) was not verified by us.
- DONKI network: both api.nasa.gov and kauai.ccmc.gsfc.nasa.gov blocked here; error path tested only.
  Hosts tried in order: api.nasa.gov/DONKI, ccmc.gsfc.nasa.gov/DONKI/WS/get (CCMC domain move announced 30 Sep 2026), kauai.ccmc.gsfc.nasa.gov (legacy).

## Open TODOs
- P0: run on the real DTM; confirm product is the campaign base DTM (06 P0).
- DTM artifact mask: no FOM / correlation mask used. Inspect `hillshade_1m.png`; consider masking cells
  where 1 m slope >> 5 m slope or seams near the image edges.
- JP2: driver JP2OpenJPEG present in rasterio wheels here; verify on the laptop (Windows/conda builds may differ).
  Fallback: `gdal_translate in.JP2 ortho.tif` with any GDAL that has JP2 support.
- THEMIS: set exact .cub file name in `config.py`; confirm GDAL reads scale/offset and NoData from the cube;
  confirm units in the label. Mosaic may use 0-360 lon; pyproj handles it, but check `thermal_ti.json` bounds.
- Thresholds 10/15/20 deg: full citation for Pena-Asensio 2024 into 04; label stays "lunar analog [R]".
- Radiation: suit/habitat shielding and SEP events not modelled; card is a published mean only.
- optical.png at 0.5 m is ~4.7 MB; use 1 m (`OPTICAL_RES_M`) or tiles if the frontend is slow.
