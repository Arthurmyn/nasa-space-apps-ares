# ML

> This folder is an unused template. Nothing in the backend or the frontend imports it, and it is not part of the ARES route planner.

## Structure
| Folder | What is in it | In git? |
|--------|---------------|---------|
| `data/raw/` | source data | ❌ |
| `data/processed/` | cleaned data | ❌ |
| `notebooks/` | EDA, experiments (`01_eda.ipynb`, `02_baseline.ipynb`, …) | ✅ |
| `models/` | trained models (`model.pkl`) | ❌ |
| `src/train.py` | reproducible training | ✅ |
| `src/inference.py` | **the contract with the backend**: `load_model`, `predict` | ✅ |

## Data
- Dataset: _link to Drive/Kaggle_
- Model: _link to the current `model.pkl`_

## Running
```bash
pip install -r ml/requirements.txt
python -m ml.src.train        # from the repo root
```

## Experiments
| Date | Model | Metric | Notes |
|------|-------|--------|-------|
| - | LogisticRegression (synthetic data) | acc ≈ 0.9 | baseline placeholder |

## Rules
- Notebooks are for research; move the final code into `src/`.
- Before committing a notebook, *Clear All Outputs* (fewer conflicts).
- If you change the input or output format of `predict`, update `docs/api.md` and warn the backend team.
