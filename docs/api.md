# REST API

Base URL: `http://localhost:8000/api` · Interactive docs (Swagger UI): **`/api/docs`**

Authenticated endpoints expect `Authorization: Bearer <JWT>` from `/auth/login`.

## Meta

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | – | Liveness, loaded model, escalation provider (`twilio` / `simulated`) |

## Auth & users

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/register` | – | `{email, password (≥ 8), full_name?}` | `201 UserOut` · `409` if email exists |
| POST | `/auth/login` | – | form: `username`, `password` (OAuth2) | `{access_token, token_type}` |
| GET | `/users/me` | ✔ | – | `UserOut` |

## Predictions

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/predict` | optional | Classify one 10 s feature window |
| GET | `/predict/model` | – | Model card metadata (type, layers, metrics, features) |

```http
POST /api/predict
{ "features": { "ear_mean": 0.21, "ear_std": 0.05, "perclos": 0.35, "blink_rate": 9,
                "blink_duration_mean": 0.6, "longest_closure": 2.5, "mar_mean": 0.2,
                "yawn_rate": 3, "pitch_mean": 12, "pitch_std": 5, "yaw_std": 4 } }
```
```json
{ "probability": 0.97, "label": "drowsy", "model_version": "drowsiness-baseline@0.1.0",
  "contributions": { "longest_closure": 0.21, "perclos": 0.09, "...": 0.0 } }
```
`422` if a feature is missing or non-finite. Every prediction is logged in `predictions`.

## Sessions & analytics

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/sessions` | ✔ | Save a session report (idempotent on `client_id`) |
| GET | `/sessions?limit=50` | ✔ | List the user's sessions, newest first |
| GET | `/analytics/summary` | ✔ | Totals, duration-weighted mean risk, risk by hour of day |

## Datasets

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/datasets/samples` | ✔ | Upload labelled windows `{samples: [{timestamp_ms, label, features}]}` (≤ 10 000) |
| GET | `/datasets/samples.csv` | ✔ | Export as CSV for `ml/data/raw/` |

## Alert escalation (phone call)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/alerts/settings` | ✔ | Phone, emergency contact, enabled, delay, `provider_configured` |
| PUT | `/alerts/settings` | ✔ | Update; numbers must be E.164 (`+919876543210`), delay 3–60 s |
| POST | `/alerts/escalate` | ✔ | Call the driver now (frontend calls this when the alarm is unacknowledged) |
| GET | `/alerts/history` | ✔ | Recent escalation attempts |

```http
POST /api/alerts/escalate
{ "reason": "Eyes closed for 2.1 s (microsleep)", "probability": 0.93, "closure_seconds": 2.1, "test": false }
```
```json
{ "status": "calling", "call_sid": "CA…", "sms_sid": "SM…", "message": "Calling +919876543210" }
```

| `status` | Meaning |
|---|---|
| `calling` | Twilio accepted the call (and SMS to the emergency contact, if set) |
| `simulated` | No Twilio credentials on the server — nothing was sent |
| `cooldown` | A call was placed < 60 s ago; not calling again |
| `failed` | Twilio returned an error |

`test: true` places a call even when escalation is disabled and never texts the emergency contact.
