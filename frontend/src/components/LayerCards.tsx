import { GCR_DOSE_EQUIVALENT_MSV_PER_DAY, GCR_DOSE_EQUIVALENT_SIGMA_MSV_PER_DAY } from "../config/radiation.ts";

/**
 * Cards for layers that have no map image at this site. Every number is a published value with
 * its source (ares_layers/facts/site_facts.json); nothing here is live or measured today.
 */

/** Thermal inertia of the layered sulfate unit that contains the boxwork (Fraeman et al. 2016, Table 2). */
export function ThermalInertiaCard() {
  return (
    <div className="value-card">
      <p className="value-card__value mono">
        355 ± 38 <span className="value-card__unit">J m⁻² K⁻¹ s⁻½</span>
      </p>
    </div>
  );
}

const DOSE_HOURS = [4, 8] as const;

/** Dose for an EVA of `hours` at the published mean rate: D = r * t / 24, sigma_D = sigma_r * t / 24. */
export const evaDose = (hours: number) => ({
  dose: (GCR_DOSE_EQUIVALENT_MSV_PER_DAY * hours) / 24,
  sigma: (GCR_DOSE_EQUIVALENT_SIGMA_MSV_PER_DAY * hours) / 24,
});

export function RadiationCard() {
  return (
    <div className="value-card">
      <p className="value-card__value mono">
        {GCR_DOSE_EQUIVALENT_MSV_PER_DAY.toFixed(2)} ± {GCR_DOSE_EQUIVALENT_SIGMA_MSV_PER_DAY.toFixed(2)}{" "}
        <span className="value-card__unit">mSv/day</span>
      </p>
      <ul className="value-card__list mono" aria-label="Dose for an EVA">
        {DOSE_HOURS.map((h) => {
          const { dose, sigma } = evaDose(h);
          return (
            <li key={h}>
              {h} h EVA: {dose.toFixed(3)} ± {sigma.toFixed(3)} mSv
            </li>
          );
        })}
      </ul>
    </div>
  );
}
