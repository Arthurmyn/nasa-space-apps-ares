/**
 * Radiation at the surface of Mars, one published number for the whole site.
 *
 * Source: Hassler, D. M. et al., "Mars' Surface Radiation Environment Measured with the Mars
 * Science Laboratory's Curiosity Rover", Science 343 (6169), 1244797 (2014),
 * https://doi.org/10.1126/science.1244797, Table 1 (GCR only): dose equivalent rate
 * 0.64 ± 0.12 mSv/day; absorbed 0.21 ± 0.04 mGy/day; mean quality factor 3.05 ± 0.26.
 * Independent check: 0.21 mGy/day x 3.05 = 0.640 mSv/day. Verified by the team against the
 * paper (ares_layers/facts/site_facts.json). Measured Aug 2012 - Jun 2013, about 300 sols, near
 * solar maximum, when galactic cosmic rays are lower; 2026 values are likely higher (inference).
 */
export const GCR_DOSE_EQUIVALENT_MSV_PER_DAY = 0.64;
export const GCR_DOSE_EQUIVALENT_SIGMA_MSV_PER_DAY = 0.12;

export const RADIATION_CITATION = {
  text: "Hassler et al., Science 343, 1244797 (2014), Table 1",
  doi: "https://doi.org/10.1126/science.1244797",
  period: "August 2012 to June 2013",
} as const;

/** Shown wherever the dose is shown. */
export const RADIATION_NOTE =
  "Published mean, not live: GCR only, MSL/RAD 2012-13 at solar maximum, excludes solar particle events. 2026 values are likely higher.";

export const RADIATION_LABEL = "Estimated radiation dose for this walk";
