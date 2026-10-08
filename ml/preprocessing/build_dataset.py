"""Merge raw session CSVs into a clean, validated training dataset.

Steps
-----
1. Load every CSV in ml/data/raw/ — each file is one recording session.
2. Validate the schema against ml/feature_spec.json.
3. Clean: drop rows with missing / non-finite values and exact duplicates.
4. Remove physiologically impossible values (e.g. EAR > 0.6, PERCLOS outside [0, 1]).
5. Drop the first `warmup` windows of every session (the 10 s window is still filling).
6. Save to ml/data/processed/dataset.csv with a `session` column for grouped CV.

    python -m ml.preprocessing.build_dataset [--include-synthetic]
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from ml.config import DATA_PROCESSED, DATA_RAW, FEATURES, GROUP, LABEL

VALID_RANGES = {
    "ear_mean": (0.0, 0.6),
    "ear_std": (0.0, 0.3),
    "perclos": (0.0, 1.0),
    "blink_rate": (0.0, 120.0),
    "blink_duration_mean": (0.0, 10.0),
    "longest_closure": (0.0, 10.0),
    "mar_mean": (0.0, 2.0),
    "yawn_rate": (0.0, 30.0),
    "pitch_mean": (-90.0, 90.0),
    "pitch_std": (0.0, 90.0),
    "yaw_std": (0.0, 90.0),
}


def load_raw(raw_dir: Path = DATA_RAW, include_synthetic: bool = True) -> pd.DataFrame:
    frames = []
    for path in sorted(raw_dir.glob("*.csv")):
        if not include_synthetic and path.stem.startswith("synthetic"):
            continue
        df = pd.read_csv(path)
        missing = set(FEATURES + [LABEL]) - set(df.columns)
        if missing:
            raise ValueError(f"{path.name}: missing columns {sorted(missing)}")
        df[GROUP] = path.stem
        frames.append(df)
    if not frames:
        raise FileNotFoundError(
            f"No CSV files in {raw_dir}. Export data from the Data Lab, or run "
            "`python -m ml.preprocessing.synthetic` to bootstrap."
        )
    return pd.concat(frames, ignore_index=True)


def clean(df: pd.DataFrame, warmup: int = 10) -> tuple[pd.DataFrame, dict]:
    report = {"rows_in": len(df)}
    df = df.replace([np.inf, -np.inf], np.nan).dropna(subset=FEATURES + [LABEL])
    report["after_dropna"] = len(df)

    df = df.drop_duplicates(subset=FEATURES + [LABEL, GROUP])
    report["after_dedup"] = len(df)

    mask = np.ones(len(df), dtype=bool)
    for col, (lo, hi) in VALID_RANGES.items():
        mask &= df[col].between(lo, hi).to_numpy()
    df = df[mask]
    report["after_range_filter"] = len(df)

    if "timestamp_ms" in df.columns:
        df = df.sort_values([GROUP, "timestamp_ms"])
    df = df[df.groupby(GROUP).cumcount() >= warmup]
    report["after_warmup"] = len(df)

    df[LABEL] = df[LABEL].astype(int)
    report["class_balance"] = df[LABEL].value_counts().sort_index().to_dict()
    report["sessions"] = int(df[GROUP].nunique())
    return df.reset_index(drop=True), report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-synthetic", action="store_true", help="ignore synthetic_*.csv files")
    ap.add_argument("--warmup", type=int, default=10)
    args = ap.parse_args()

    df, report = clean(load_raw(include_synthetic=not args.no_synthetic), warmup=args.warmup)
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    out = DATA_PROCESSED / "dataset.csv"
    df.to_csv(out, index=False)
    for k, v in report.items():
        print(f"  {k:>20}: {v}")
    print(f"Saved {len(df)} windows → {out}")


if __name__ == "__main__":
    main()
