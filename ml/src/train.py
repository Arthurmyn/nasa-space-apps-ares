"""Baseline-обучение. Заменить синтетику на реальный датасет из ml/data/.

Запуск из корня репо: python -m ml.src.train
"""

from pathlib import Path

import joblib
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"


def main() -> None:
    # TODO: загрузить реальные данные: pd.read_csv(DATA_DIR / "processed" / "train.csv")
    X, y = make_classification(n_samples=500, n_features=2, n_informative=2, n_redundant=0,
                               random_state=42)
    feature_names = ["x1", "x2"]

    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
    clf = LogisticRegression().fit(X_tr, y_tr)
    print(f"accuracy: {accuracy_score(y_te, clf.predict(X_te)):.3f}")

    MODELS_DIR.mkdir(exist_ok=True)
    out = MODELS_DIR / "model.pkl"
    joblib.dump({"model": clf, "feature_names": feature_names}, out)
    print(f"saved -> {out}")


if __name__ == "__main__":
    main()
