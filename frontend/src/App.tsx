import { useEffect, useState } from "react";
import { api, type HealthResponse, type PredictResponse } from "./api/client";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e: Error) => setError(e.message));
  }, []);

  const runPredict = async () => {
    setError(null);
    try {
      setResult(await api.predict({ features: { x1: 1.0, x2: 0.5 } }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 640, margin: "48px auto", padding: 16 }}>
      <h1>Ares</h1>
      <p>
        Backend: {health ? `${health.status}, model loaded: ${health.model_loaded}` : "…"}
      </p>
      <button onClick={runPredict}>Test /predict</button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
