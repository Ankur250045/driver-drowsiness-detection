# Data

| Folder | Contents | Git |
|---|---|---|
| `raw/` | CSV exports from the web app's **Data Lab** (`drowsiness_dataset_*.csv`) or the backend (`GET /api/datasets/samples.csv`) | ignored |
| `processed/` | `dataset.parquet`/`.csv` produced by `python -m ml.preprocessing.build_dataset` | ignored |
| `mrl_eye/` | *(optional)* MRL Eye Dataset for the eye-state CNN, see below | ignored |

## Feature-window CSV schema

One row = one 10-second sliding window (sampled once per second). Columns follow
[`../feature_spec.json`](../feature_spec.json):

```
timestamp_ms, ear_mean, ear_std, perclos, blink_rate, blink_duration_mean,
longest_closure, mar_mean, yawn_rate, pitch_mean, pitch_std, yaw_std, label
```

`label`: `0 = alert`, `1 = drowsy`. Each CSV file is treated as one **recording session**
(the grouping unit for cross-validation, so windows from the same session never appear in
both train and test).

## Collecting data

1. `npm run dev` in `frontend/`, open **Data Lab**.
2. Record ≥ 2 minutes of *alert* and ≥ 2 minutes of *simulated drowsy* behaviour
   (slow blinks, long closures, yawns, head nods). Repeat across lighting conditions,
   with/without glasses, and with several people.
3. Export CSV → drop into `ml/data/raw/`.

## Synthetic bootstrap data

`python -m ml.preprocessing.synthetic` writes `raw/synthetic_*.csv` from class-conditional
distributions with per-session (subject) offsets and 5 % label noise. It exists so the
pipeline can be run end-to-end before real data is collected — **metrics on synthetic data
say nothing about real-world performance** and must not be reported as such.

## MRL Eye Dataset (eye-state CNN)

Download from <http://mrl.cs.vsb.cz/eyedataset> (≈ 85 k infrared eye crops, open/closed),
extract to `ml/data/mrl_eye/` so files look like `mrl_eye/s0001/s0001_00001_0_0_0_0_0_01.png`.
The 5th underscore-separated field is the eye state (0 = closed, 1 = open).
