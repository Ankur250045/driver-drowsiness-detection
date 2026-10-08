"""Server-side inference using the same portable model artifact as the browser.

The artifact (JSON) is produced by ml/training/train_classifier.py or by in-browser
training, so frontend and backend predictions are identical by construction.
"""

import json
import logging
import math
from dataclasses import dataclass
from pathlib import Path

from app.services.preprocessing import to_vector

log = logging.getLogger(__name__)

_ACTIVATIONS = {
    "relu": lambda x: max(0.0, x),
    "sigmoid": lambda x: 1.0 / (1.0 + math.exp(-x)) if x >= -500 else 0.0,
    "linear": lambda x: x,
    "tanh": math.tanh,
}


@dataclass
class ModelArtifact:
    name: str
    version: str
    type: str
    trained: bool
    features: list[str]
    mean: list[float]
    scale: list[float]
    layers: list[dict]
    metrics: dict | None
    raw: dict

    @classmethod
    def load(cls, path: Path) -> "ModelArtifact":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            name=data["name"],
            version=data["version"],
            type=data["type"],
            trained=bool(data.get("trained")),
            features=data["features"],
            mean=data["scaler"]["mean"],
            scale=data["scaler"]["scale"],
            layers=data["layers"],
            metrics=data.get("metrics"),
            raw=data,
        )

    @property
    def version_tag(self) -> str:
        return f"{self.name}@{self.version}"


class DrowsinessModel:
    def __init__(self, artifact: ModelArtifact):
        self.artifact = artifact

    def _standardize(self, x: list[float]) -> list[float]:
        a = self.artifact
        return [(v - m) / (s or 1.0) for v, m, s in zip(x, a.mean, a.scale)]

    def _forward(self, z: list[float]) -> float:
        h = z
        for layer in self.artifact.layers:
            out = list(layer["bias"])
            weights = layer["weights"]
            for i, hi in enumerate(h):
                row = weights[i]
                for j in range(len(out)):
                    out[j] += hi * row[j]
            act = _ACTIVATIONS[layer["activation"]]
            h = [act(v) for v in out]
        return h[0]

    def predict(self, features: dict[str, float]) -> tuple[float, dict[str, float]]:
        """Returns P(drowsy) and occlusion-based per-feature contributions."""
        z = self._standardize(to_vector(features, self.artifact.features))
        p = self._forward(z)
        contributions = {}
        for i, name in enumerate(self.artifact.features):
            occluded = z.copy()
            occluded[i] = 0.0
            contributions[name] = p - self._forward(occluded)
        return p, contributions


_model: DrowsinessModel | None = None


def load_model(path: Path) -> DrowsinessModel:
    global _model
    _model = DrowsinessModel(ModelArtifact.load(path))
    log.info("Loaded model %s from %s", _model.artifact.version_tag, path)
    return _model


def get_model() -> DrowsinessModel:
    if _model is None:
        raise RuntimeError("Model not loaded")
    return _model
