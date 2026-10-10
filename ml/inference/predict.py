"""Run the exported JSON model on feature windows (same math as browser + backend).

    python -m ml.inference.predict --csv ml/data/raw/session.csv
    python -m ml.inference.predict --features '{"ear_mean": 0.22, ...}'
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from ml.config import FRONTEND_MODEL

ACT = {
    "relu": lambda x: np.maximum(x, 0),
    "sigmoid": lambda x: 1 / (1 + np.exp(-x)),
    "linear": lambda x: x,
    "tanh": np.tanh,
}


class PortableModel:
    def __init__(self, artifact: dict):
        self.a = artifact
        self.mean = np.array(artifact["scaler"]["mean"])
        self.scale = np.array(artifact["scaler"]["scale"])

    @classmethod
    def load(cls, path: Path = FRONTEND_MODEL) -> "PortableModel":
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        h = (np.atleast_2d(X) - self.mean) / np.where(self.scale == 0, 1, self.scale)
        for layer in self.a["layers"]:
            h = ACT[layer["activation"]](h @ np.array(layer["weights"]) + np.array(layer["bias"]))
        return h[:, 0]

    def predict_df(self, df: pd.DataFrame) -> np.ndarray:
        return self.predict_proba(df[self.a["features"]].to_numpy(dtype=float))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", type=Path, default=FRONTEND_MODEL)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--csv", type=Path)
    g.add_argument("--features", type=str, help="JSON object of feature values")
    args = ap.parse_args()

    model = PortableModel.load(args.model)
    print(f"Model: {model.a['name']}@{model.a['version']} ({model.a['type']})")
    if args.features:
        p = model.predict_df(pd.DataFrame([json.loads(args.features)]))[0]
        print(f"P(drowsy) = {p:.3f} -> {'DROWSY' if p >= 0.5 else 'alert'}")
    else:
        df = pd.read_csv(args.csv)
        df["p_drowsy"] = model.predict_df(df)
        print(df[["timestamp_ms", "p_drowsy"] + (["label"] if "label" in df else [])].to_string(index=False))


if __name__ == "__main__":
    main()
