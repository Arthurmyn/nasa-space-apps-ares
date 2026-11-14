import { useEffect, useState } from "react";
import { fetchThermalInfo } from "../api/client.ts";
import type { ThermalInfo } from "../api/types.ts";
import { useSite } from "../state/SiteContext.tsx";

const date = (iso: string | null) => (iso && !Number.isNaN(new Date(iso).getTime()) ? new Date(iso).toISOString().slice(0, 10) : null);

/** Colour bar and honest limits of the thermal layer, read from the layer's own JSON. */
export function ThermalLegend() {
  const { site } = useSite();
  const [info, setInfo] = useState<ThermalInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setInfo(null);
    setFailed(false);
    fetchThermalInfo(site.id, ctrl.signal)
      .then(setInfo)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        console.warn("Thermal legend unavailable", e);
        setFailed(true);
      });
    return () => ctrl.abort();
  }, [site.id]);

  if (failed) return <p className="legend__note">Legend unavailable</p>;
  if (!info) return null;

  const gradient = `linear-gradient(to right, ${info.stops.map(([p, c]) => `${c} ${p * 100}%`).join(", ")})`;
  const observed = date(info.observationStartUtc);
  return (
    <div className="thermal-legend">
      <div className="thermal-legend__bar" style={{ backgroundImage: gradient }} role="img" aria-label="Thermal colour scale, low to high" />
      <div className="thermal-legend__scale mono">
        <span>{info.dnMin}</span>
        <span>relative brightness</span>
        <span>{info.dnMax}</span>
      </div>
      <p className="legend__note">
        One THEMIS observation{observed ? ` (${observed})` : ""}, {info.nativePixelM} m per pixel: each block is one pixel and the site covers only a few.
        Stretched 8-bit values, not calibrated temperature.
      </p>
    </div>
  );
}
