# DrowsiGuard AI — Real-time Driver Drowsiness Detection

> Computer vision + machine learning system that detects driver fatigue (microsleeps, slow blinks, yawning,
> head nodding) from a webcam **in real time, entirely in the browser** — and phones the driver if the
> alarm doesn't wake them.

![stack](https://img.shields.io/badge/TensorFlow.js-MediaPipe-orange) ![stack](https://img.shields.io/badge/React-TypeScript-blue)
![stack](https://img.shields.io/badge/FastAPI-SQLAlchemy-teal) ![stack](https://img.shields.io/badge/scikit--learn-TensorFlow-yellow)
![license](https://img.shields.io/badge/license-MIT-green)

## Highlights

- **On-device vision pipeline** — MediaPipe Face Mesh (478 3D landmarks) on WebGL at ~30 FPS; no video leaves the browser.
- **Feature engineering** — EAR, MAR and 3D head pose per frame → 11 temporal features over a 10 s window
  (PERCLOS, blink rate & duration, longest closure, yawn rate, nodding…).
- **ML classifier** — logistic regression / MLP producing a calibrated drowsiness probability, EMA-smoothed, combined
  with a hard microsleep rule in an alert state machine.
- **Explainable AI** — live occlusion-based feature attributions ("why does the model think I'm drowsy?").
- **Train in the browser** — record labelled data in the *Data Lab*, train a neural net with TensorFlow.js, inspect loss
  curves / confusion matrix / ROC-AUC, and hot-deploy it to the monitor.
- **Reproducible Python ML pipeline** — preprocessing, 5-model comparison with session-grouped cross-validation,
  evaluation reports, portable model export, and an eye-state CNN on the MRL Eye Dataset.
- **Escalating alerts** — on-screen alarm → sound → vibration → **automatic phone call** (Twilio) and SMS to an
  emergency contact when the alarm goes unacknowledged.
- **FastAPI backend** — JWT auth, prediction API, session analytics, dataset collection; SQLite via SQLAlchemy.
- **Tested** — Vitest (feature maths, classifier, metrics) and pytest (API, escalation with mocked Twilio, export fidelity).

## Repository layout

```
├── frontend/            React + TypeScript + Vite + Tailwind web app
│   ├── app/             entry point, router, route pages (Monitor, Analytics, Data Lab, Model Card…)
│   ├── components/      UI (camera + mesh overlay, gauges, charts, XAI panel, alert overlay…)
│   ├── hooks/           useDrowsinessEngine, useCamera, useEscalation, useBackend
│   ├── services/        face detection, feature extraction, classifier, TF.js trainer, API client
│   ├── types/           shared TypeScript types
│   └── public/models/   deployed model artifact (drowsiness_model.json)
├── backend/             FastAPI service
│   └── app/{api,services,database,models,utils}
├── ml/                  data → preprocessing → training → evaluation → models → inference (+ notebooks)
│   └── feature_spec.json   ← single source of truth for model inputs
├── docs/                architecture.md · api.md · ml-report.md
├── tests/               frontend (vitest) · backend (pytest) · ml (pytest)
└── docker-compose.yml
```

## Quick start

### 1. Frontend (works on its own)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Open **Live Monitor**, allow camera access, click **Calibrate**, then **Start session**.
Use Chrome/Edge on desktop or Android Chrome (vibration is Android-only).

### 2. Backend (accounts, analytics, phone-call escalation)

Requires Python 3.11+.

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                               # macOS/Linux: cp .env.example .env
uvicorn app.main:app --reload                        # http://localhost:8000/api/docs
```

The Vite dev server proxies `/api` to port 8000, so just refresh the web app — the sidebar shows **API · Online**.

### 3. Phone-call escalation (optional)

1. Create a Twilio account, buy/verify a voice-capable number (trial accounts can only call verified numbers).
2. Put `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` in `backend/.env` and restart the API.
3. In the web app: sign in → Live Monitor → **Emergency call escalation** → enter your number in E.164 format
   (`+91…`), enable, **Test call**.

Without credentials the feature runs in clearly-labelled *simulated* mode (logged, nothing sent).

### 4. ML pipeline

```bash
pip install -r ml/requirements.txt
python -m ml.preprocessing.synthetic          # optional: bootstrap data to test the pipeline
python -m ml.preprocessing.build_dataset      # merge ml/data/raw/*.csv → processed dataset
python -m ml.training.train_classifier        # compare 5 models, write reports, export best model
python -m ml.training.train_eye_cnn --data ml/data/mrl_eye   # optional CNN
python -m ml.inference.realtime_webcam        # optional OpenCV desktop demo
```

Collect real data in the **Data Lab** (export CSV → `ml/data/raw/`). See [ml/data/README.md](ml/data/README.md).

### 5. Docker

```bash
docker compose up --build        # web app → http://localhost:8080, API → http://localhost:8000
```

### Tests

```bash
cd frontend && npm test          # vitest
pytest                           # from repo root: backend + ml
```

## How it works

```
Webcam → Face Mesh (478 pts) → EAR · MAR · head pose → 10 s window → 11 features
       → standardise → LogReg/MLP → P(drowsy) → EMA → state machine → alarm → phone call
```

See [docs/architecture.md](docs/architecture.md) for the full diagram, and [docs/ml-report.md](docs/ml-report.md)
for the methodology (feature definitions, leakage-free evaluation, results template, limitations).

## Safety notice

This is an educational / research prototype, **not a certified safety device**. If you feel tired, stop and rest.

## License

MIT © Ankur Verma
