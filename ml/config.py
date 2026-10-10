"""Paths and shared constants for the ML pipeline."""

import json
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
REPO_ROOT = ML_DIR.parent
DATA_RAW = ML_DIR / "data" / "raw"
DATA_PROCESSED = ML_DIR / "data" / "processed"
MODELS_DIR = ML_DIR / "models"
REPORTS_DIR = ML_DIR / "evaluation" / "reports"
FRONTEND_MODEL = REPO_ROOT / "frontend" / "models" / "drowsiness_model.json"

FEATURE_SPEC = json.loads((ML_DIR / "feature_spec.json").read_text(encoding="utf-8"))
FEATURES: list[str] = [f["name"] for f in FEATURE_SPEC["features"]]
LABEL = "label"
GROUP = "session"
RANDOM_STATE = 42
