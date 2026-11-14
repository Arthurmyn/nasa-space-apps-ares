# MARSWALK - project breakdown

Date: 14 November 2026 (day 1 of the hackathon).
Source: `MARSWALK CONTEXT.pdf` (14 pages) - a combined context assembled from the PRD v1.0 (13 November), the Research report (6 November), the System Spec v2.0, the Spec v2.0 Verification Report and the Research & Technical Dossier v0.1.

The priority rule from the context itself: **if a number in the context disagrees with the Verification Report, the Verification Report is right.**

This file is a detailed retelling of the context with explanations and conclusions. Marks:
- **[from the context]** - stated directly in the PDF;
- **[inference]** - our interpretation or a consequence, not written explicitly in the PDF;
- **[to check]** - a claim that must be confirmed before use.

---

## 0. In short

| Question | Answer |
|---|---|
| What we build | A web planner of a single astronaut walking excursion (EVA) across the boxwork on Mount Sharp in Gale crater |
| What the user enters | Up to 6 science targets on the map |
| What they get | A **candidate** route habitat → targets → habitat that accounts for terrain and EVA limits |
| How we stand out | Real NASA layers in one window + **every** number on the screen has a source and a label (measured / model / assumption / proxy) |
| Scope | One zone (`GALE-BX`), 48 hours. Everything after the hackathon is out of scope |
| The first task before route code | R0: prove that the HiRISE DTM covers the 2025-26 boxwork site. Decision before 12:00 on day 1 |
| What we must not say | "safe route", "real time", "a new A* algorithm on metabolism" (SEXTANT already did that) |

Name: in the brief it is **ARES**, in the documents **MARSWALK**. Not decided (open question Q3). The repository is currently `nasa-space-apps-ares`.

---

## 1. The product in one paragraph

MARSWALK is a single-EVA planner for the boxwork of Mount Sharp in Gale crater. The planner picks up to 6 science targets; the application returns a **candidate route** from the habitat through the targets and back, accounting for terrain. For every segment it shows:

- the distance (3-D);
- the elevation gain;
- the time;
- an effort index (relative, not an absolute consumption);
- the EVA time budget;
- a **point-of-no-return** marker relative to the walk-back limit.

The application combines several NASA datasets in one window:
- HiRISE: an orthoimage + a digital terrain model (DTM);
- THEMIS: thermal inertia;
- Curiosity Mastcam / Navcam images;
- RAD (radiation);
- REMS (weather).

It shows explicitly where the data is native, where it is coarse, and where it is missing, and attaches this structure to **every** displayed number:

```
{value, unit, source_tag, label}
```

**[inference]** This is the central technical contract of the project. It must be built into the backend data schema from the first commit, not added at the end: test V12 requires 100% coverage.

---

## 2. The problem

### 2.1. The essence of the problem [from the context]

1. Mars data is scattered across missions, instruments, archives, formats, coordinate systems (CRS), resolutions and dates. Mars Trek and the USGS-NASA geologic maps work at a regional or global scale. **Nothing plans a single human walking excursion at the scale of metres.**
2. A plan assembled from unconnected layers can pass every single check and still fail as a whole. Examples:
   - a stop fits the time budget but lies beyond the walk-back limit;
   - a slope looks gentle on the 463 m MOLA grid but is steep on the 1 m DTM;
   - unregistered layers create false hazards or false "safe" corridors.
3. In today's workflow nothing checks that the crew can walk back **from every point** of the route.

### 2.2. Problem statement [from the context]

How can heterogeneous Mars mission data be combined into a transparent decision support system that helps mission planners and surface explorers find science targets and evaluate candidate routes, explicitly accounting for coverage, resolution, uncertainty, terrain risk and EVA limits?

### 2.3. Research questions

| RQ | Question | How we answer |
|---|---|---|
| RQ1 Data integration | Which datasets can be co-registered at a useful local scale? | R1, V1 |
| RQ2 Route feasibility | Which terrain and context variables give a reproducible route cost? | R2-R5, V5-V10 |
| RQ3 Science value | How can stops be ranked without exaggerating orbital data? | R6 |
| RQ4 Generalizability | What is reused between zones (AOIs) and what is region configuration? | NF2 (we build only one AOI) |
| RQ5 Transparency | How can gaps, resolution mismatch, data age and uncertainty be shown? | R1, R7 |

A known gap: **no user interviews were conducted.**

---

## 3. Users

| Persona | What they need |
|---|---|
| Mission planner (habitat / control centre) | Pick targets → get a candidate route; see data coverage; a cost breakdown by segment; EVA limit and walk-back flags; if there is no route - a **named blocking constraint** |
| Astronaut / field researcher | The goal of the next point, the distance, a first-person image from the rover; a briefing that repeats **only computed** numbers |
| Science specialist | For each target: the objective, the value estimate, the evidence type, the confidence, the sources; a separation of "measured / interpretation / hypothesis" |
| Hackathon judge | A public link, no login, build a route in < 3 minutes; a NASA source and a measured/modelled label on every number |

**[inference]** The judge is effectively the main user for the 48 hours. The demo scenario must satisfy their requirements: open the link → pick targets → see the route → hover over a number → see the source.

---

## 4. Area of interest (AOI)

### 4.1. Parameters [from the context]

- **ID:** `GALE-BX` - the boxwork of Mount Sharp, Gale crater.
- **Search frame:** 137-138°E, −5.5…−4.3°.
- **Narrow fallback search frame:** 137.2-137.6°E, −5.1…−4.6°.

### 4.2. Why Gale and Curiosity

- The only region in our scope with surface radiation measurements (RAD), plus REMS weather, thousands of Mastcam/Navcam images, detailed orbital images and spectra.
- The wording "the only radiation instrument on a surface" **must be checked against the primary source** before the pitch. **[to check]**

### 4.3. Why exactly the boxwork

- It is an example from the official text of the challenge.
- The ridges are natural obstacles, so routing makes sense (rather than a straight line across a plain).
- The structure lies in a sulfate-bearing unit and records the history of groundwater and diagenesis.

### 4.4. Science context [from the context]

- The Altadena Member, the Mirador formation.
- Ridges 5-9 m wide and 1-2 m high (GSA 2025; PIA26696).
- Drilling points: Altadena, Valle de la Luna, Nevado Sajama (sol 4718, a ridge).
- The science objective: diagenesis along fractures.
- **We do not claim a "ridge versus hollow" chemistry difference** - Seeger et al. 2026 found no chemical difference.

**[inference]** For R6 (science targets) this means: targets are worded as "study diagenesis along fracture X", not "the ridge is richer in mineral Y than the hollow".

### 4.5. Risks of the zone choice

- Other teams may also choose the boxwork (it is in the text of the challenge). We win through data accuracy, traceability and honest uncertainty.
- Second zones (Garden City, Inca City) are **out of scope** for the hackathon.

---

## 5. Data layers

### 5.1. Layer table [from the context]

| Layer | Product / source | Resolution | Role and caveats |
|---|---|---|---|
| Orthoimage | HiRISE ortho | 25 cm | The visual base |
| Elevations | HiRISE DTM `DTEEC_001488_1750_001752_1750_U02` | 1 m (z from −4485.57 to −2977.08 m) | Slope, roughness, routing. **Coverage of the 2025-26 site is not proven (R0).** "Box" artifacts of 0.5-1 m, CCD seams, faceted zones - mask them. For slope, use the relative accuracy; the absolute ±1.3 m is not used for slope |
| Slope / roughness | Derived from the DTM | 1 m | The hazard mask. Slopes at 1 m come out steeper than at 5 m |
| Thermal inertia | THEMIS TI | 100 m | **Context only**, absolute accuracy ~20%, never a per-cell hazard. The tile name to be clarified (Q10) |
| Mineralogy | CRISM | - | A stretch layer, only if a scene over the site is confirmed |
| Rover images | Curiosity Mastcam / Navcam (PIA / PDS ID) | - | A first-person view for each target, with the author credit |
| Rover positions | MSL PLACES, doi:10.17189/1520397 (sol 4534+) | - | The overlay for R0 |
| Radiation | Curiosity RAD (Hassler et al. 2014) | point | A card only (P1), not a spatial map |
| Weather | Curiosity REMS (sol 1-4488) | point | A historical climatology card only (P1) |
| Optional fill | MSL 1 m DEM mosaic | 1 m grid | If we use it, the UI must say "1 m grid ≠ 1 m data" where the mosaic is filled in by CTX/HRSC |

### 5.2. Rules for working with data [from the context]

1. One documented local metric projection for the whole zone.
2. **The planet radius is read from the label of each product, never hardcoded.**
3. We do not touch the source files.
4. We clip to the zone in COG format (DTM ~360 MB).

### 5.3. Rejected sources

- **Bickel et al. 2024**, a global landslide catalog. Only 11 records near Gale, the nearest ~40 km from Mount Sharp, none in the boxwork. The detector's completeness is ~13% and the HiRISE coverage is small, so **the absence of landslides ≠ safety**. We take hazards from slope, images and rover data.

### 5.4. Coordinate systems (QGIS)

- For planetocentric data, `Mars_2000_(Sphere)` ESRI:104971 or `IAU_2015:49900` (ocentric) are correct.
- Planetographic CRSs can shift points by up to ~10 km.

**[inference]** Any overlay of sources (DTM, rover positions, Trek tiles) must be made only after an explicit check of which latitude system each source uses. Otherwise R0 can give a false answer.

---

## 6. Requirements

Priorities: **P0** - without this we cannot submit. **P1** - only if all of P0 is ready; we cut from the bottom up.

### 6.1. P0 - functional

| ID | Requirement | Acceptance criterion | Owner |
|---|---|---|---|
| **R0** | AOI coverage gate - **the first task, before route code** | The DTM outline (`gdalinfo` / USGS STAC) overlaid on Curiosity positions sol 4534+. Overlap → `GALE-BX` confirmed. No → search STAC for another DTM. No there either → use the DTM's own boxwork and say so on the slide. Decision by 12:00 on day 1 | Alikhan + Aikyn |
| R1 | The AOI layer stack with provenance and coverage | A toggle, opacity, a legend, units; for each layer: mission, instrument, product ID, date, resolution, CRS, URL; a native/resampled/missing coverage mask with % of the AOI; an artifact mask (V3) with %; THEMIS labelled as context | Aikyn (QA Alikhan) |
| R2 | The hazard mask, a configurable slope limit | θ_max 15° by default (a lunar analog, tagged), θ_alt 20° as an option; changing the limit rebuilds the route; unknown cells get an uncertainty penalty, **never a zero cost** | Aikyn |
| R3 | A route through ≤ 6 targets and back | A* on an 8-connected 1 m grid; the order by brute force, the user can fix the order; ≤ 10 s for 6 targets; no route → the blocking constraint is named, **never a straight line** | Aikyn → Arthur |
| R4 | Route explanation, time, effort | For each segment: 3-D distance, elevation gain, time, the metabolic effort index, the share of each cost term | Aikyn, Alikhan's model |
| R5 | The EVA time budget + the way back | T_EVA = 1 h egress/ingress + walking + science time + reserve against T_max; a point-of-no-return marker against 1 h / 3.5 km; the first segment that breaks the limit is highlighted | Aikyn, Alikhan's parameters |
| R6 | Science targets with evidence and rover images | ≥ 3 targets: coordinates, objective, value estimate (s_rel, s_div, s_gt, s_new), evidence type, confidence, ≥ 1 source, a Mastcam/Navcam image with ID and credit | Alikhan |
| R7 | Provenance labels + a claims banner | Every number is `{value, unit, source_tag, label}`, 100% covered by test V12; a banner "Candidate route - not safety-certified"; a provenance panel with the active parameters and sensitivity variants | Aikyn + Arthur |
| R8 | The route briefing | Generated from the plan JSON; every number matches exactly; any use of an LLM is declared | Alikhan (text), Arthur (UI) |
| R9 | The submission package | A public link without login (checked in a private window); ≤ 7 slides or a ≤ 30 s video, English, no NASA logo; all datasets/images/code listed; AI media watermarked; the novelty slide cites SEXTANT | Berdibek, Alikhan |

### 6.2. P0 - non-functional

| ID | Requirement | Acceptance |
|---|---|---|
| NF1 Reproducibility | Layers and routes are traceable to inputs | The plan JSON stores layer IDs, parameter values, the algorithm version |
| NF2 Compatibility | One documented local CRS | A PROJ string in the `GALE-BX` config; source files untouched |
| NF3 Performance | The AOI loads without global data | Clipped COGs; the AOI opens in ≤ 5 s (target) |
| NF4 Reliability | A missing layer does not crash the application | Remove THEMIS from the config → "unavailable", routing works |
| NF5 Explainability | No black-box decisions | Covered by R4 |
| NF6 Scientific integrity | Measured / computed / interpretation / assumption are separated | Covered by R6-R7 |

### 6.3. P1 - the order of cutting from the bottom up

| ID | Feature | Note |
|---|---|---|
| R10 | Sensitivity variants + presets | 4 km/h, η = 2.1, θ = 20°, T_max = 4 h; shortest / least effort / best data confidence |
| R11 | O₂ by segment (illustrative) | k = 4.039 + 1.157·RER; leakage and capacity are shown as [DATA REQUIRED] |
| R12 | The radiation card | 0.64 × 8/24 ≈ 0.21 mSv for an 8-hour EVA (V11); the SEP scenario of 8.1 mGy (May 2024) is added, not multiplied; "dose equivalent ≠ effective dose"; 0.8 mSv/day is shown as a proposal, not a requirement |
| R13 | REMS climatology + a dust-season flag | "historical, sols 1-4488"; plausibility of pressure 660-970 Pa; global storms Ls ≈ 185-315° |
| R14 | A sensitivity table (V9) + Monte Carlo N = 50 | σ_z from the relative accuracy of the DTM; a corridor frequency layer |
| R15 | Export | GeoJSON + CSV with provenance fields |
| R16 | Line of sight to the habitat | Viewshed; time out of line of sight |
| R17 | A simplified field view | High contrast, only the next point |
| R18 | A boulder layer (CV) | A labelled demo layer; if not ready - roughness instead |

**[inference]** P1 is cut from the bottom: R18 goes first, R10 last.

---

## 7. Models and default parameters (after Verification)

| Parameter | MVP value | Label | Source |
|---|---|---|---|
| Walking speed V_nominal | **2 km/h** (4 km/h only as a sensitivity variant) | Lunar ConOps [R] | EVA-EXP-0042 Rev B |
| The speed-slope shape | Tobler, normalized to V(0) ≈ 5 km/h, scaled to V_nominal | Earth, unsuited [R] | Tobler 1993 |
| Hard slope limit θ_max | 15° (derived at 5 m LOLA; slopes at 1 m look steeper) | Lunar analog [R] | Peña-Asensio 2024 |
| Upper limit θ_alt | 20° | Lunar ConOps [R] | EVA-EXP-0042 Rev B |
| Walk-back limit | **1 h of walking or 3.5 km** (the lunar 10 km only for comparison) | Mars assumption [R] | ICES-2026-127 |
| Egress + ingress | 1 h | Lunar ConOps [R] | EVA-EXP-0042 Rev B |
| Max EVA T_max | 8 h (4 h as a second variant) | Reference architecture | Rucker & Hoffman 2020; HEOMD-415 |
| Mars gravity g_M | 3.73 m/s² | Established | NSSDC fact sheet |
| Effort model | Pandolf + Santee for descent (the Looney 2018 variant, +25·S²; bias −13 ± 87 W), scaled by g (H-6.1 [R]) | 1 g validated | Looney et al. 2018 |
| Terrain coefficient η | 1.0 by default, range up to 2.1 (loose sand) | [R] | Kim et al. 2024 |
| The Apollo envelope of 780-1200 BTU/h | Compare only with the average over the whole EVA, never with a segment | Lunar proxy | TN D-7883 |
| The energy equivalent of O₂ | k = 4.039 + 1.157·RER; RER 0.85 → 5.02 kcal/L | Established | ICES-2026-127 |
| GCR dose, Gale | **0.64 ± 0.12 mSv/day** (0.21 ± 0.04 mGy/day), Aug 2012 - Jun 2013 | Measured | Hassler et al. 2014, Science, Table 1 |
| SEP model | Additive: D = Ḋ_GCR·T + D_SEP·(the fraction of the event within the EVA window) | Model | Berger 2018; NASA 2024 |
| Planet radius | From the label of each product | Rule | PDS labels |
| DTM σ_z | Relative accuracy (read the value from the label, Q9) | Data | HiRISE DTM README |

### 7.1. Permanent flags in the UI [from the context]

- The load / body mass ratio of the effort model, ~1.5-2, is outside the validated range of 0.3-0.45. So effort is a **relative index**, not an absolute prediction of O₂ or metabolism.
- There is no calibration on "3/8 g in a suit" data (such data does not exist).

### 7.2. Never use by default

- 4 km/h;
- a 10 km radius;
- 0.67 mSv/day (this is a figure from a press release, not from the paper).

**[inference]** This must be fixed by an automated test: the success metric "old default values in the config = 0".

### 7.3. How a segment calculation is assembled [inference]

A scheme that follows from the parameter table:

1. The slope of the segment S from the DTM (relative accuracy).
2. The speed v = V_tobler(S), scaled so that v(0) = V_nominal = 2 km/h.
3. The segment time t = 3-D length / v.
4. The power by Pandolf/Santee (Looney 2018), scaled by g_M / g_Earth, multiplied by η.
5. The segment effort = power × t → this is a relative index.
6. (P1) O₂ = energy / k, where k = 4.039 + 1.157·RER.
7. The cell cost for A* is a combination of terms (time, effort, an uncertainty penalty); R4 requires showing the share of each term.

The exact cost formula and the weights must be taken from Spec v2.0 (it is not in the context). **[to check]**

---

## 8. The data contract

1. Every displayed number: `{value, unit, source_tag, label}`, where `label ∈ {measured, model, assumption, proxy}` (plus the [R]/[E] tags from the specification).
2. The **plan JSON** is the only source for the UI, the briefing and the slides. It contains: layer IDs, parameter values, the algorithm version, the route geometry, per-segment metrics, flags.
3. Data gaps and artifact zones are **never** treated as safe terrain. Targets placed there are rejected with a stated reason.

### 8.1. A schema sketch [inference]

```jsonc
// A number with provenance
{ "value": 2.0, "unit": "km/h", "source_tag": "EVA-EXP-0042-RevB", "label": "assumption" }

// The plan (top level)
{
  "aoi_id": "GALE-BX",
  "algorithm_version": "0.1.0",
  "crs": "<PROJ string>",
  "layers": [{ "id": "...", "mission": "...", "instrument": "...", "product_id": "...",
               "date": "...", "resolution_m": 1.0, "url": "...",
               "coverage": { "native_pct": 0, "resampled_pct": 0, "missing_pct": 0 } }],
  "parameters": { "v_nominal": {/* a number with provenance */}, "theta_max": {}, "t_max": {} },
  "targets": [{ "id": "...", "lon": 0, "lat": 0, "objective": "...", "score": {}, "sources": [] }],
  "route": { "geometry": {/* GeoJSON LineString */},
             "segments": [{ "distance_3d": {}, "climb": {}, "time": {}, "effort_index": {},
                            "cost_shares": {} }] },
  "eva": { "t_eva": {}, "t_max": {}, "point_of_no_return": {}, "first_breaking_segment": null },
  "flags": ["candidate-route-not-safety-certified", "effort-is-relative-index"]
}
```

---

## 9. The wording policy (UI, slides, form)

- We say: "candidate route", "relative cost", "terrain proxy", "historical".
- We do not say: "safe route", real-time weather/radiation, a safety guarantee.
- EVA consumables and rover energy are separate.
- Lunar or 1 g data applied to Mars is labelled as a proxy.
- Formation hypotheses (for example, an origin from groundwater) are labelled as hypotheses.
- NASA's plans are round-trip missions; "one-way" is a SpaceX concept, do not mix them.

---

## 10. Novelty: what can and cannot be claimed

**The predecessor: SEXTANT** (MIT; Johnson 2010, Johnson et al. 2009, Norheim 2018) already does:
- metabolic A*;
- separate astronaut and rover energy;
- the best way home.

**Do not claim this as new.**

The differences we defend:
1. A combination of Mars mission data (HiRISE, THEMIS, CRISM context, Curiosity images, REMS, RAD) on one boxwork zone.
2. A way back limited by consumables with a margin, and a point-of-no-return marker.
3. Route uncertainty (Monte Carlo over DTM noise) with a provenance label on every number.
4. A model of the science value of targets tied to the route.

Before the pitch, check (Q11): whether Mars Trek / JMARS make profiles or routes. **[to check]** (see `03-nasa-resources-audit.md`: the Trek catalog has a "Traverse Path" category, but it is a path layer, not a planner.)

---

## 11. Validation tests

| Test | What it proves | Priority |
|---|---|---|
| V1 | Registration through control points | Stretch |
| V3 | DTM artifacts are masked | Stretch |
| V4 | Path length against the great-circle arc; the 8-connectivity bias (−5.4%, Ono et al., JPL) | Stretch |
| **V5** | The A* cost = the Dijkstra cost on 50 random subgrids | **P0** |
| **V6** | The same output on a repeated run | **P0** |
| **V7** | With g-scale = 1 the code reproduces the published Pandolf values | **P0** |
| V8 | The Apollo envelope is compared only with the average over the whole EVA | - |
| V9 | The sensitivity table | Stretch |
| **V10** | The point of no return is correct to within 1 cell on a synthetic case | **P0** |
| V11 | The arithmetic of the radiation card | Stretch |
| **V12** | 100% of displayed numbers have a source tag and a label | **P0** |

The rule: "verified implementation" ≠ "plausible vs proxy". A comparison with a proxy is **never** called "validated".

**[inference]** All five P0 tests are purely backend (V12 is partly frontend). They can be written in parallel with the route code; V5, V6, V10 need no real data - synthetic grids are enough.

---

## 12. Non-goals

- Certifying a route as safe.
- Claiming metabolic A* or the way home as new.
- Absolute predictions of O₂ / metabolism.
- Real-time weather or radiation.
- A claim about a "ridge versus hollow" chemistry difference.
- A second zone.
- A spatial radiation map / a dose-versus-altitude model.
- Rover energy, multi-sol planning, a field mode, a scientific paper.
- CV boulders as a safety layer.

---

## 13. The team

| Person | Area |
|---|---|
| Arthur | Frontend, CV, integration |
| Aikyn | Backend, terrain, routing, deployment |
| Alikhan | Science, parameters, validation, texts |
| Berdibek | Visuals, slides, sources, AI disclosure, QA |

### 13.1. Aikyn's load [inference]

Almost the whole P0 critical path lies on Aikyn:

- R0 (together with Alikhan) - today by 12:00;
- R1 - the layer stack and coverage;
- R2 - the slope mask;
- R3 - A* and the order of targets (then handed to Arthur for the UI);
- R4, R5 - segment metrics and the EVA budget;
- R7 - the `{value, unit, source_tag, label}` contract (together with Arthur);
- Q7 - serving the 360 MB DTM and the ortho tiles;
- deployment (the public link for R9).

The risk: one person is the bottleneck for R1→R3→R4/R5→R8. It makes sense to give Arthur a stable plan JSON contract as early as possible (even on stubs), so the frontend does not wait for a real route.

---

## 14. Timeline and gates

- The submission window: opens Sat 14 November 9:00, closes **Sun 15 November 23:59 local time** (clarify the time zone, Q4).
- Internal submission: **Sun 20:00** (a 4 h buffer); the feature freeze is proposed for 16:00.
- The R0 decision - **day 1, 12:00**.
- **The vertical slice gate (end of day 1):** one AOI, three layers, one target, one candidate route with time and a way back on real terrain. Not reached → **all of P1 is cut**.

### 14.1. Dependencies [from the context]

```
R0 ──► R1 ──► R3 ──► R4 ──┐
 │            ▲     R5 ──┼──► R8
 └──► Q6 ─────┘     R6 ──┘
R9 ◄── deployment (Q7) + the 2026 guide (Q5)
```

- R1 and Q6 need R0.
- R3 needs R1 and Q6.
- R4-R5 need R3.
- R8 needs R4-R6.
- R9 needs a deployed build (Q7) and the 2026 guide (Q5).

---

## 15. Success metrics

| Metric | Success | Stretch |
|---|---|---|
| An outsider plans a full EVA from the public link | ≤ 3 min | ≤ 1 min |
| An outsider names the provenance, the main cost driver, one data gap | 2 of 2 | Without hints |
| Route calculation, 6 targets | ≤ 10 s | ≤ 3 s |
| The P0 tests pass (V5, V6, V7, V10, V12) | 5 of 5 | + V1, V3, V4, V9, V11 |
| Different types of NASA data in one window | 3 + rover images | 4 (CRISM) |
| Numbers without a source tag / label | 0 | 0 |
| Old default values (4 km/h, 10 km, 0.67) in the config | 0 | 0 |
| Buffer before closing | ≥ 3 h | ≥ 4 h |

The judging criteria (the 2025 guide, to be compared with 2026): Impact, Creativity, Validity, Relevance, Presentation.

---

## 16. Open questions

| # | Question | Owner | Blocks? |
|---|---|---|---|
| Q1 | Does the DTM cover the 2025-26 boxwork site? | Alikhan + Aikyn | **Yes, blocks everything** |
| Q2 | What is listed in the Resources 2026 tab? | Alikhan | Yes (partly closed, see `03-nasa-resources-audit.md`) |
| Q3 | The product name ARES or MARSWALK; the team name | Alikhan | Yes |
| Q4 | A local or a universal event; which time zone sets 23:59? | Alikhan | Yes |
| Q5 | Changes in the 2026 submission and judging guide | Berdibek | Yes |
| Q6 | The habitat location in the AOI (notional, flat, covered by data) | Alikhan + Aikyn | Yes (after R0) |
| Q7 | Serving the 360 MB DTM and the ortho tiles | Aikyn | Yes (clip to the AOI, COG) |
| Q9 | The relative vertical accuracy σ_z of this DTM | Alikhan | For R14 |
| Q10 | The THEMIS tile name and the CRISM scenes over the site | Alikhan | No |
| Q11 | Do Mars Trek / JMARS make profiles or routes? | Alikhan | Before the pitch |
| Q12 | Reference values of Pandolf 1977 / Looney 2018 for V7 | Alikhan | For V7 |
| Q13 | AI tools for the briefing and visuals; the watermark and disclosure | Berdibek | No |

Closed: Q8 - the GCR dose 0.64 ± 0.12 mSv/day (Hassler 2014, Table 1).

---

## 17. Pre-demo checklist

- [ ] The demo starts in `GALE-BX` and shows the R0 coverage proof
- [ ] ≥ 3 different data categories are visible and documented
- [ ] The legend and units are clear
- [ ] Every layer shows its provenance and resolution
- [ ] Every science target has a traceable source
- [ ] The route is labelled as a candidate, with an explanation of cost and distance
- [ ] Data gaps and uncertainty are visible
- [ ] The team can explain the algorithm without calling it a safety system
- [ ] The demo separates what is implemented from what is planned
- [ ] Every screenshot, value and claim in the pitch matches the working prototype

---

## 18. Sources (from the context)

- MARSWALK PRD v1.0 - https://claude.ai/artifact/Wkx1JQRz93STfjGRSMeGF3
- Research report (6 November) - https://claude.ai/artifact/CRAZD24DmiNLyrcPEHhcjS
- MARSWALK System Spec v2.0, Spec v2.0 Verification Report, Research & Technical Dossier v0.1 (project documents)
- NASA Space Apps Challenge 2026 - https://www.spaceappschallenge.org/2026/
- xEVA ConOps EVA-EXP-0042 Rev B - https://www.nasa.gov/wp-content/uploads/2017/02/eva-exp-0042_xeva_system_con_ops_rev_b_final_dtd_10192020_ref_doc.pdf
- ICES-2026-127 - https://ntrs.nasa.gov/api/citations/20260003038/downloads/Final_ICES2026_Mars_Mass_1.pdf
- Hassler et al. 2014, Science - https://doi.org/10.1126/science.1244797
- SWSC 2016 Table 2 - https://www.swsc-journal.org/articles/swsc/full_html/2016/01/swsc150074/T2.html
- Peña-Asensio 2024 - https://boris.unibe.ch/194784
- Looney et al. 2018 - https://academic.oup.com/milmed/article/183/9-10/e357/5025891
- NSSDC Mars fact sheet - https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
- MSL PLACES - doi:10.17189/1520397
- Bickel et al. 2024, a global landslide catalog (GRL) - rejected for the AOI

---

## 19. Observations and risks [inference]

1. **R0 is the single point of failure.** If the DTM `DTEEC_001488_1750_001752_1750_U02` does not cover the site, everything changes: the layers, the habitat, the demo. The image numbers 001488 and 001752 belong to the early PSP phase (2006-07) and were probably taken to choose the landing site. We need a fallback DTM before 12:00. In detail - `02-r0-coverage-gate.md`.
2. **A candidate for a fallback DEM was found:** Mars Trek has "MRO HiRISE, Gale Crater DEM" (`Gale_DEM_SMG_1m`), and the rover's current position (sol 5073) lies in its frame. In detail - `03-nasa-resources-audit.md`.
3. **The number-with-provenance contract** must be put into the Pydantic schemas right away; adding it at the end is impossible without a rewrite.
4. **The A* cost formula** (the weights of the terms, the uncertainty penalty) is not given in the context - it must be taken from Spec v2.0 or agreed with Alikhan.
5. **The habitat location (Q6)** is not defined, and R3 cannot be launched without it. A proposal: right after R0, choose a flat cell with native coverage next to the rover's site and label it a "notional habitat site".
6. **The repository skeleton** is currently a template (`/predict`, sklearn). MARSWALK needs the endpoints `GET /aoi/{id}`, `GET /layers`, `POST /plan`; the Python dependencies `rasterio`, `numpy`, `pyproj`, `shapely`; an ML layer as such is almost not needed (except the optional R18).
7. **The deadline time zone (Q4)** is a cheap question, but if we get it wrong, the project will not be submitted. Close it today.
