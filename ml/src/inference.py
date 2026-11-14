"""Public ML interface for the backend. Do not change signatures without agreeing with the backend team."""

from pathlib import Path
from typing import Any

import joblib


def load_model(path: str | Path) -> Any:
    return joblib.load(path)


def predict(model: Any, features: dict[str, float]) -> dict:
    """features -> {"prediction": ..., "confidence": ...}"""
    bundle = model
    x = [[features.get(name, 0.0) for name in bundle["feature_names"]]]
    clf = bundle["model"]
    pred = clf.predict(x)[0]
    conf = float(clf.predict_proba(x)[0].max()) if hasattr(clf, "predict_proba") else None
    return {"prediction": pred.item() if hasattr(pred, "item") else pred, "confidence": conf}
