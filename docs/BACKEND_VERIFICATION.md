# Backend route verification — 2026-11-14

Implemented `/api/v1/layers`, `/api/v1/sites`, `/api/v1/route` against
`DATA_CONTRACT.md` and the existing frontend response types. The grid is read at
startup with `np.fromfile`; requests use the cached arrays and catalog.

## Checks performed

| Check | Observed result |
| --- | --- |
| Backend pytest, Python 3.12 | 22 passed |
| Data pipeline pytest | 52 passed |
| Ruff: backend app, tests and bundle smoke script | All checks passed |
| Root Vercel configuration, official schema with Draft7Validator | No validation errors |
| Official `@vercel/python@32.0.0` builder, backend service configuration | Built Linux x86_64 function, runtime `python3.12`, 1616 bundled files |
| Bundled data | `meta.json`, `elevation.bin`, `slope.bin`, `stops.json`, `assumptions.json`, `sources.json` present |
| Extracted function on WSL Ubuntu, Python 3.12.16, using its `_vendor` dependencies | `/layers` 200, `/sites` 200, `/route` 200; out-of-grid point 422 |
| Five long route legs from the packaged function | 1.214 s; 5875.12 m total; maximum slope 7° |
| Actual packaged responses through frontend `parseRouteResponse` and `parseLayersResponse` | Both accepted |

The backend tests cover a hill detour, a longer but cheaper route around walkable
steep terrain, disconnected and no-data barriers, diagonal corner blocking,
invalid points, slope limit enforcement, cached reads after deleting a source
file, missing/corrupt data (503), ordered and coincident stops, science metadata,
response shape and the three-second performance limit.

The data checks retain the real-terrain connectivity assertions when
`is_test_data: false`; synthetic terrain is explicitly identified and checked for
format, provenance and size. Existing upstream dependencies emit deprecation
warnings, but no tests fail.

## Reproduce

From the repository root, with Python/uv and Node/npm available:

```sh
uv run --no-project --python 3.12 --with-requirements backend/requirements.txt python -m pytest backend/tests -q -s
# In an environment with scripts/requirements-grid.txt installed:
python -m pytest scripts/tests -q
uvx ruff check backend/app backend/tests scripts/verify_backend_bundle.py
```

Build the function without a Vercel account (POSIX shell; PowerShell can set
`$env:NODE_PATH` to the same installation's `node_modules`):

```sh
npm install --prefix /tmp/ares-vercel-builder --no-audit --no-fund @vercel/python@32.0.0 @vercel/build-utils@15.4.0
NODE_PATH=/tmp/ares-vercel-builder/node_modules node scripts/verify_backend_build.cjs
```

The build uses an isolated temporary directory, the root's actual backend
service settings, and writes the extracted function under
`backend/.vercel/verified-function`. It asserts that all six data files match the
source files byte for byte. On Linux (or WSL with the repository path mounted):

```sh
uv run --no-project --python 3.12 python scripts/verify_backend_bundle.py backend/.vercel/verified-function
node --experimental-strip-types --input-type=module -e "import fs from 'node:fs'; import {parseRouteResponse,parseLayersResponse} from './frontend/src/api/validate.ts'; parseRouteResponse(JSON.parse(fs.readFileSync('backend/.vercel/verified-route.json','utf8'))); parseLayersResponse(JSON.parse(fs.readFileSync('backend/.vercel/verified-layers.json','utf8'))); console.log('Frontend validators accepted both responses');"
```

`vercel build --yes` itself stopped with `login_required`: this machine has no
valid Vercel login. The successful check above invokes Vercel's official builder
directly and executes the resulting Linux package. A cloud preview deployment
and end-to-end public routing have not been verified.

The service uses `root: backend`, `framework: fastapi`, entrypoint `app.main:app`
and an explicit `functions["app/main.py"].includeFiles: "data/gale-bx/**"`.
Configuration references: [Vercel service configuration](https://vercel.com/docs/services/config-reference),
[FastAPI entrypoints and startup](https://vercel.com/docs/frameworks/backend/fastapi).
The pytest settings were moved from `backend/pyproject.toml` to `pytest.ini`:
the builder attempted a uv project install on the old file, which had no
`[project]` table. Dependencies now resolve from `requirements.txt`.

## Test terrain and limitations

The committed terrain and frontend rasters were generated with
`python scripts/make_fake_grid.py --cell 2`: 316 × 430, 2 m cells, 708905 bytes
including companion files, `is_test_data: true` in both metadata copies.
Replacing the grid files with real terrain requires a process restart, without
changing the API code.

The science catalog retains the original rover coordinates and provenance.
On this synthetic terrain, `bx-3` has slope 20.5° and correctly returns 422 at
the 15° limit. Its position and science description were not fabricated to fit
the synthetic hills. Choose valid map positions for the synthetic-route demo.

`alternative` is always null and `hazards` is empty. Planning thresholds and
walking speed remain explicitly `TO VERIFY` in the data-owned assumptions.
