"""Synthetic feature-window generator (bootstrap / testing only).

Class-conditional Gaussians (same parameters as frontend/services/syntheticData.ts),
plus per-session "subject" offsets and AR(1) temporal correlation so that the
data has the structure of real recordings: windows within a session are
correlated, and sessions differ from each other. 5 % of labels are flipped to
emulate annotation noise.

    python -m ml.preprocessing.synthetic --sessions 12 --minutes 4
"""

import argparse

import numpy as np
import pandas as pd

from ml.config import DATA_RAW, FEATURES, RANDOM_STATE

DISTRIBUTIONS: dict[str, dict[str, tuple[float, float]]] = {
    "alert": {
        "ear_mean": (0.28, 0.035),
        "ear_std": (0.035, 0.012),
        "perclos": (0.06, 0.04),
        "blink_rate": (15, 6),
        "blink_duration_mean": (0.18, 0.07),
        "longest_closure": (0.35, 0.25),
        "mar_mean": (0.14, 0.07),
        "yawn_rate": (0.3, 0.7),
        "pitch_mean": (0, 6),
        "pitch_std": (3, 1.5),
        "yaw_std": (4, 2),
    },
    "drowsy": {
        "ear_mean": (0.25, 0.04),
        "ear_std": (0.05, 0.02),
        "perclos": (0.14, 0.08),
        "blink_rate": (12, 6),
        "blink_duration_mean": (0.32, 0.18),
        "longest_closure": (0.9, 0.7),
        "mar_mean": (0.19, 0.1),
        "yawn_rate": (1.2, 1.4),
        "pitch_mean": (4, 8),
        "pitch_std": (4.2, 2.5),
        "yaw_std": (4.5, 2.5),
    },
}
LABEL_NOISE = 0.05
AR_COEF = 0.7  # temporal correlation between consecutive 1 s windows
SUBJECT_SCALE = 0.4  # per-session offset, as a fraction of each feature's std


def generate_session(rng: np.random.Generator, session_id: str, minutes: float) -> pd.DataFrame:
    n_per_class = int(minutes * 60 / 2)
    subject_offset = {f: rng.normal(0, SUBJECT_SCALE) for f in FEATURES}
    rows, t = [], 0
    for label, cls in enumerate(("alert", "drowsy")):
        noise = {f: 0.0 for f in FEATURES}
        for _ in range(n_per_class):
            row = {"timestamp_ms": t * 1000}
            for f in FEATURES:
                mu, sigma = DISTRIBUTIONS[cls][f]
                noise[f] = AR_COEF * noise[f] + np.sqrt(1 - AR_COEF**2) * rng.normal()
                v = mu + sigma * (noise[f] + subject_offset[f])
                if f != "pitch_mean":
                    v = max(0.0, v)
                if f == "perclos":
                    v = min(1.0, v)
                row[f] = v
            row["label"] = 1 - label if rng.random() < LABEL_NOISE else label
            row["session"] = session_id
            rows.append(row)
            t += 1
    return pd.DataFrame(rows)


def generate(n_sessions: int = 12, minutes: float = 4, seed: int = RANDOM_STATE) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    return pd.concat(
        [generate_session(rng, f"synthetic_{i:02d}", minutes) for i in range(n_sessions)], ignore_index=True
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sessions", type=int, default=12)
    ap.add_argument("--minutes", type=float, default=4)
    ap.add_argument("--seed", type=int, default=RANDOM_STATE)
    args = ap.parse_args()

    DATA_RAW.mkdir(parents=True, exist_ok=True)
    df = generate(args.sessions, args.minutes, args.seed)
    for session_id, part in df.groupby("session"):
        part.drop(columns="session").to_csv(DATA_RAW / f"{session_id}.csv", index=False)
    print(f"Wrote {df['session'].nunique()} synthetic sessions ({len(df)} windows) to {DATA_RAW}")


if __name__ == "__main__":
    main()
