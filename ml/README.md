# ML

## Структура
| Папка | Что лежит | В git? |
|-------|-----------|--------|
| `data/raw/` | исходные данные | ❌ |
| `data/processed/` | очищенные данные | ❌ |
| `notebooks/` | EDA, эксперименты (`01_eda.ipynb`, `02_baseline.ipynb`, …) | ✅ |
| `models/` | обученные модели (`model.pkl`) | ❌ |
| `src/train.py` | воспроизводимое обучение | ✅ |
| `src/inference.py` | **контракт с backend**: `load_model`, `predict` | ✅ |

## Данные
- Датасет: _ссылка на Drive/Kaggle_
- Модель: _ссылка на актуальный `model.pkl`_

## Запуск
```bash
pip install -r ml/requirements.txt
python -m ml.src.train        # из корня репо
```

## Эксперименты
| Дата | Модель | Метрика | Заметки |
|------|--------|---------|---------|
| - | LogisticRegression (синтетика) | acc ≈ 0.9 | baseline-заглушка |

## Правила
- Ноутбуки - для исследований; финальный код переносим в `src/`.
- Перед коммитом ноутбука - *Clear All Outputs* (меньше конфликтов).
- Меняешь формат входа/выхода `predict` - обнови `docs/api.md` и предупреди backend.
