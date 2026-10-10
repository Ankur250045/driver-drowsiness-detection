# Driver Drowsiness Detection

B.Tech project: a web application that watches the driver through a webcam and raises an alarm when signs of
drowsiness appear (long eye closures, slow blinking, yawning, head nodding). If the driver does not react, it makes
their **smartwatch vibrate** and finally **phones them**. Saved driving sessions are analysed with **R**.

- Frontend: plain **HTML, CSS and JavaScript** (no framework, no build step), TensorFlow.js + MediaPipe Face Mesh, Chart.js
- Backend: **Python / FastAPI**, SQLite (SQLAlchemy), Twilio (phone calls), ntfy (smartwatch notifications)
- Machine learning: scikit-learn / TensorFlow pipeline in `ml/`, in-browser training with TensorFlow.js
- Insights: **R** (ggplot2, dplyr, statistical tests) in `r/`

## Features

| | |
|---|---|
| Login | Sign in / create account; every page requires login |
| Driver types | Personal car, cab/taxi, truck — each gets its own thresholds and screen |
| Detection | 478 face landmarks → EAR, MAR, head pose → 11 features over 10 s → classifier → probability |
| Alarm ladder | red screen + beeping → phone vibration → **smartwatch vibration** → **phone call** + SMS to emergency contact |
| Smartwatch | (1) urgent push notification via ntfy, mirrored by any watch that shows phone notifications; (2) direct Bluetooth "Immediate Alert" for bands that support it |
| Cab mode | shift timer, break reminder every 2 h, extra sensitivity at night, quiet "passenger on board" alarm |
| Truck mode | most sensitive settings, driving-hours log, compulsory 45 min break after 4.5 h (as in EU rule 561/2006), fleet manager as emergency contact |
| Sessions | every drive is saved with charts and an event list |
| Training | record your own examples, train a neural network in the browser, see loss curves / confusion matrix |
| Insights (R) | charts and tests: drowsiness by hour, by driver type, night vs day, session length, PERCLOS |

## Project structure

```
frontend/            the website (served by the backend)
  login.html  profile.html  monitor.html  sessions.html  insights.html  training.html
  css/style.css
  js/                features.js, classifier.js, engine.js, detector.js, watch.js, alarm.js, drivers.js, ...
  js/pages/          one script per page
  models/            drowsiness_model.json (the classifier used in the browser and by the API)
  insights/          charts + summary.json written by the R script
backend/             FastAPI app (app/api, app/services, app/models, app/database)
r/                   insights.R, install_packages.R
ml/                  data → preprocessing → training → evaluation → models (+ notebook)
docs/                architecture.md, api.md, ml-report.md
tests/               frontend (vitest), backend and ml (pytest)
```

## How to run

You need Python 3.11+ and (for the Insights page) R 4.x.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # macOS/Linux: cp .env.example .env
uvicorn app.main:app --reload
```

Open **http://localhost:8000** in Chrome, create an account, choose your driver type, allow the camera, click
**Calibrate**, then **Start driving**.

### R insights

```bash
Rscript r/install_packages.R                              # once
Rscript r/insights.R backend/drowsiguard.db frontend/insights
```

or press **Run R analysis again** on the Insights page. With fewer than 10 recorded sessions the script adds
clearly-marked example sessions so the charts are not empty.

### Smartwatch

1. Install the **ntfy** app on your phone.
2. Profile page → *Create new topic* → subscribe to it in the app.
3. Allow ntfy notifications in your watch's companion app (Galaxy Wearable, Zepp, Mi Fitness, Wear OS, …).
4. Press *Send test vibration*.

Fitness bands that support the Bluetooth Immediate Alert service can also be connected directly on the Monitor page
(Chrome on Android, Windows or Mac).

### Phone call (optional)

Create a Twilio account, put `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` in `backend/.env`,
restart the server and enable the call on the Profile page. Without them, calls are only simulated.

### ML pipeline (optional)

```bash
pip install -r ml/requirements.txt
python -m ml.preprocessing.build_dataset        # CSV files from the Training page → ml/data/raw/
python -m ml.training.train_classifier          # compares 5 models, writes reports, exports the best one
```

### Tests

```bash
npm install && npm test                             # JavaScript unit tests
backend\.venv\Scripts\python -m pytest tests/backend
```

## How the detection works

1. **Eye Aspect Ratio** for each eye (Soukupová & Čech, 2016): `EAR = (|p2−p6| + |p3−p5|) / (2·|p1−p4|)`.
   About 0.3 when the eye is open, close to 0 when closed.
2. **Mouth Aspect Ratio** for yawns and **head pitch / yaw / roll** from the 3D landmarks.
3. Over the last 10 seconds: **PERCLOS** (share of time with eyes closed), blink rate, blink duration, longest closure,
   yawn rate and head-movement statistics — 11 features.
4. A logistic-regression / small neural-network model turns these into a probability, smoothed over time.
5. Alarm if the eyes stay closed longer than the microsleep limit or the probability passes the alarm threshold.

See [docs/architecture.md](docs/architecture.md) and [docs/ml-report.md](docs/ml-report.md) for details.

## Limitations

This is a student project and not a certified safety device. It works worse in poor light, with sunglasses or with
large head turns, and the default model is an untrained baseline until you train one on real data.

## License

MIT © Ankur Verma
