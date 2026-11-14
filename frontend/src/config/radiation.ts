/**
 * Radiation at the surface of Mars, one measured number for the whole site.
 *
 * Source: Hassler, D. M. et al., "Mars' Surface Radiation Environment Measured with the Mars
 * Science Laboratory's Curiosity Rover", Science 343 (6169), 1244797, online 9 Dec 2013,
 * https://doi.org/10.1126/science.1244797. The figure below is the one in the SwRI release about
 * that paper (quote from the RAD principal investigator): "an average GCR dose equivalent rate of
 * 0.67 millisieverts per day from August 2012 to June 2013 on the Martian surface".
 * https://www.swri.org/press-release/swri-scientists-publish-first-radiation-measurements-surface-mars
 * Checked against that release; the paper itself is not open and was not read.
 */
export const GCR_DOSE_EQUIVALENT_MSV_PER_DAY = 0.67;

export const RADIATION_CITATION = {
  text: "Hassler et al., Science 343, 1244797 (2014)",
  doi: "https://doi.org/10.1126/science.1244797",
  release: "https://www.swri.org/press-release/swri-scientists-publish-first-radiation-measurements-surface-mars",
  period: "August 2012 to June 2013",
} as const;

/** Shown wherever the dose is shown. */
export const RADIATION_NOTE =
  "Galactic cosmic rays only, measured by Curiosity RAD at Gale, excludes solar particle events, not a forecast.";

export const RADIATION_LABEL = "Estimated radiation dose for this walk";
