"""Feature contract shared with the frontend and ml/ (see ml/feature_spec.json)."""

import json
import math
from functools import lru_cache

from app.utils.config import get_settings


@lru_cache
def feature_spec() -> dict:
    return json.loads(get_settings().feature_spec_path.read_text(encoding="utf-8"))


def feature_names() -> list[str]:
    return [f["name"] for f in feature_spec()["features"]]


class FeatureValidationError(ValueError):
    pass


def to_vector(features: dict[str, float], order: list[str] | None = None) -> list[float]:
    """Order a feature dict into the model's input vector, rejecting missing/non-finite values."""
    order = order or feature_names()
    missing = [n for n in order if n not in features]
    if missing:
        raise FeatureValidationError(f"Missing features: {', '.join(missing)}")
    vector = [float(features[n]) for n in order]
    bad = [n for n, v in zip(order, vector) if not math.isfinite(v)]
    if bad:
        raise FeatureValidationError(f"Non-finite values for: {', '.join(bad)}")
    return vector
