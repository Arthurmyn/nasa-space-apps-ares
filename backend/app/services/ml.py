"""Тонкая обёртка над ml.src.inference. Бэкенд не знает, что внутри модели."""

import logging
import sys
from typing import Any

from app.core.config import ROOT_DIR, settings

sys.path.insert(0, str(ROOT_DIR))  # чтобы импортировать пакет `ml` из корня репо

from ml.src import inference  # noqa: E402

log = logging.getLogger(__name__)


class ModelService:
    def __init__(self) -> None:
        self._model: Any = None

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        if not settings.model_path.exists():
            log.warning("Model not found at %s — run `python -m ml.src.train`", settings.model_path)
            return
        self._model = inference.load_model(settings.model_path)
        log.info("Model loaded from %s", settings.model_path)

    def predict(self, features: dict[str, float]) -> dict:
        if not self.loaded:
            raise RuntimeError("Model is not loaded")
        return inference.predict(self._model, features)


model_service = ModelService()
