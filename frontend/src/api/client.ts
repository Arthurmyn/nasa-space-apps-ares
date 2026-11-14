// Типы зеркалят backend/app/schemas/. Меняется контракт — меняем здесь и в docs/api.md.

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000") + "/api/v1";

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
}

export interface PredictRequest {
  features: Record<string, number>;
}

export interface PredictResponse {
  prediction: number | string;
  confidence: number | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthResponse>("/health"),
  predict: (body: PredictRequest) =>
    request<PredictResponse>("/predict", { method: "POST", body: JSON.stringify(body) }),
};
