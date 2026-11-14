# Architecture

> Note: the component table and data flow below describe the original project template (a `predict` endpoint backed by a model). The current system is a route planner: the backend reads a terrain grid and runs A* routing. For the current state see [README.md](../README.md), [api.md](api.md) and [DATA_CONTRACT.md](DATA_CONTRACT.md).

## Components

| Component | Responsibility | Owner |
|-----------|----------------|-------|
| `frontend` | UI, API calls, showing model results | Frontend |
| `backend` | REST API, validation, business logic, model loading | Backend |
| `ml` | Data preparation, training, saving the model, the `predict` function | ML |

## Data flow

```
User → frontend → POST /api/v1/predict → backend
                                           │
                           services/ml.py  │  loads ml/models/model.pkl
                                           ▼  once at startup
                               ml.src.inference.predict(...)
                                           │
user ← frontend ← JSON { prediction, ... } ┘
```

## The backend ↔ ML boundary

The ML team provides **one interface**, `ml/src/inference.py`:

```python
def load_model(path: str) -> Any: ...
def predict(model: Any, features: dict) -> dict: ...
```

The backend does not know what is inside (sklearn, PyTorch, a call to an LLM API). This lets ML change the model without touching the API.

## Decisions (ADR-lite)

| # | Decision | Why |
|---|----------|-----|
| 1 | Monorepo | One team, one board, atomic PRs across layers |
| 2 | FastAPI | The same Python as ML; automatic Swagger for the frontend |
| 3 | React + Vite + TS | Fast dev server, types catch contract errors |
| 4 | Model in the backend process memory | Simpler than a separate inference service for a hackathon |

_Add rows here when you make an important decision._
