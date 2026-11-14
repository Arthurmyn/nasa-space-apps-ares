/** Documents cited by the assumptions in backend/data/gale-bx/assumptions.json as [1] to [5]; [6] is the source of the site context text. */
export interface Reference {
  n: number;
  citation: string;
  url: string;
}

export const REFERENCES: readonly Reference[] = [
  {
    n: 1,
    citation: "NASA EVA-EXP-0075, Exploration EVA System ConOps for Artemis Phase 1.",
    url: "https://www.nasa.gov/wp-content/uploads/2020/01/topic_1-_eva_lunar_surface_concept_of_operations.pdf",
  },
  {
    n: 2,
    citation: "NASA Moon to Mars Architecture 2024, Lunar Mobility Drivers and Needs.",
    url: "https://www.nasa.gov/wp-content/uploads/2024/06/acr24-lunar-mobility-drivers-and-needs.pdf",
  },
  {
    n: 3,
    citation: "Apollo 11 Lunar Surface Journal, Lunar gaits.",
    url: "https://www.nasa.gov/wp-content/uploads/static/history/alsj/a11/a11.gaits.html",
  },
  {
    n: 4,
    citation: "JPL PIA26017, Curiosity's difficult climb.",
    url: "https://www.jpl.nasa.gov/images/pia26017-a-map-of-curiositys-difficult-climb/",
  },
  {
    n: 5,
    citation: "Hassler, D. M. et al., Mars' Surface Radiation Environment Measured with the Mars Science Laboratory's Curiosity Rover, Science 343 (6169), 1244797, 2014, Table 1 (GCR only): 0.64 ± 0.12 mSv/day.",
    url: "https://doi.org/10.1126/science.1244797",
  },
  {
    n: 6,
    citation: "NASA's Curiosity Rover Sees Martian 'Spiderwebs' Up Close, NASA/JPL-Caltech, Jet Propulsion Laboratory, 23 February 2026.",
    url: "https://nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-rover-sees-martian-spiderwebs-up-close",
  },
];
