/**
 * The text of the "Method and references" panel. Placeholder wording: the team replaces it.
 * Keep the numbers out of the sentences where the app already knows them: write {name} and
 * MethodPanel fills it from the open site (meta.json) and from config/route.ts. A value that is
 * not known is shown as "not stated", never guessed. Sources are cited as [n] from
 * config/references.ts; the list is printed under the sections.
 */

export interface MethodSection {
  id: "terrain" | "route" | "step-cost" | "time" | "limits" | "radiation" | "limitations";
  title: string;
  /** Plain paragraphs. */
  paragraphs: readonly string[];
  /** Optional list under the paragraphs. */
  bullets?: readonly string[];
  /** A formula or code-like line, shown set apart. */
  formula?: string;
}

export interface MethodContent {
  title: string;
  intro: string;
  sections: readonly MethodSection[];
}

/** Names MethodPanel can fill into a {name} placeholder. */
export type MethodValues = Readonly<{
  cellM: string;
  slopeWindowM: string;
  cautionDeg: string;
  maxDeg: string;
  dtm: string;
}>;

export const METHOD: MethodContent = {
  title: "Method and references",
  intro:
    "How ARES gets from a terrain model to a route and an EVA readiness level. This text is a placeholder for the team to refine; the numbers come from the open site and from the route service.",
  sections: [
    {
      id: "terrain",
      title: "Terrain",
      paragraphs: [
        "The terrain is a grid of elevation and slope made from a HiRISE digital terrain model ({dtm}). Cells are {cellM} on a side.",
        "Slope is the central difference of elevation that was smoothed first, taken across a window of {slopeWindowM}. Cells without a measurement are marked no data and cannot be crossed.",
      ],
    },
    {
      id: "route",
      title: "Route",
      paragraphs: [
        "The route is found with A* search over the grid, moving between the 8 neighbouring cells, through the start and up to 5 stops in order. A cell steeper than the route limit ({maxDeg}) cannot be crossed.",
        "Three profiles change the cost: Fast, Balanced and Safe. Safe uses the caution slope ({cautionDeg}) as the hard limit and falls back to the route limit when no path exists; the result then says so.",
      ],
    },
    {
      id: "step-cost",
      title: "Step cost",
      paragraphs: ["Each step between two cells costs its length, made larger on a slope. k is 1 for Balanced and Safe, and 0.5 for Fast, so steeper shortcuts win more often."],
      formula: "step cost = length × (1 + k × (slope ÷ limit)²)",
    },
    {
      id: "time",
      title: "Time",
      paragraphs: [
        "Time is the distance divided by the walking speed in the assumptions below. The way back repeats the stops in reverse, and the round trip is the two times added.",
      ],
    },
    {
      id: "limits",
      title: "Limits",
      paragraphs: [
        "The caution slope is {cautionDeg} and the route limit is {maxDeg}. They are ARES planning values taken from lunar analogs, not Mars suit limits; the assumptions below say where each number comes from.",
        "EVA readiness is NOT ADVISED when there is no path or the round trip is longer than the EVA limit. It is MARGINAL when the steepest section is above the caution slope, or when Safe fell back. Otherwise it is NOMINAL.",
      ],
      bullets: ["Every assumption whose source is not yet checked is marked TO VERIFY in the table below."],
    },
    {
      id: "radiation",
      title: "Radiation",
      paragraphs: [
        "The dose shown for a route is arithmetic on a published mean rate measured by Curiosity's RAD instrument [5]: rate × time. It leaves out the suit, a habitat and solar particle events, and the rate is from 2012-13, so 2026 values are likely higher.",
      ],
    },
    {
      id: "limitations",
      title: "Limitations",
      paragraphs: ["This is a candidate route for planning support. It is not a safety guarantee."],
      bullets: [
        "Slope comes from a terrain model, not from the ground; boulders, sand and rock are not modelled.",
        "Hazard zones are steep-slope zones only.",
        "The geologic unit comes from a global map at 1:20,000,000, coarse and not site-scale.",
        "The weather is measured at the Curiosity rover's own position, not at your route.",
      ],
    },
  ],
};

/** Replace each {name} with its value from `values`; an unknown name is left as it is, so a typo shows. */
export function fillMethodText(text: string, values: MethodValues): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? values[key as keyof MethodValues] : whole));
}
