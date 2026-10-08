"""Export scikit-learn pipelines to the portable JSON artifact used by the
browser (frontend/services/classifier.ts) and the FastAPI backend
(backend/app/services/ml_service.py)."""

import json
from datetime import datetime, timezone
from pathlib import Path

from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ml.config import FEATURES

EXPORTABLE = (LogisticRegression, MLPClassifier)


def is_exportable(pipeline: Pipeline) -> bool:
    return isinstance(pipeline[-1], EXPORTABLE)


def to_artifact(pipeline: Pipeline, name: str, metrics: dict, source: str) -> dict:
    scaler: StandardScaler = pipeline.named_steps["scaler"]
    clf = pipeline[-1]

    if isinstance(clf, LogisticRegression):
        layers = [
            {
                "weights": [[float(w)] for w in clf.coef_[0]],
                "bias": [float(clf.intercept_[0])],
                "activation": "sigmoid",
            }
        ]
        model_type = "logistic_regression"
    elif isinstance(clf, MLPClassifier):
        if clf.activation != "relu":
            raise ValueError("Only ReLU MLPs are exportable")
        layers = []
        for i, (W, b) in enumerate(zip(clf.coefs_, clf.intercepts_)):
            last = i == len(clf.coefs_) - 1
            layers.append(
                {
                    "weights": W.astype(float).tolist(),
                    "bias": b.astype(float).tolist(),
                    "activation": "sigmoid" if last else "relu",
                }
            )
        model_type = "mlp"
    else:
        raise TypeError(f"{type(clf).__name__} cannot be exported to the portable format")

    now = datetime.now(timezone.utc)
    return {
        "name": name,
        "version": now.strftime("%Y%m%d%H%M%S"),
        "type": model_type,
        "trained": True,
        "source": source,
        "features": FEATURES,
        "scaler": {"mean": scaler.mean_.astype(float).tolist(), "scale": scaler.scale_.astype(float).tolist()},
        "layers": layers,
        "metrics": metrics,
        "trained_at": now.isoformat(),
    }


def save_artifact(artifact: dict, *paths: Path) -> None:
    text = json.dumps(artifact, indent=2)
    for p in paths:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
