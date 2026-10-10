// engine.js — the detection loop.
//
// every frame:   landmarks → EAR, MAR, head pose → sliding 10 s window
// every 200 ms:  window → 11 features → classifier → smoothed probability
// then:          decide the status (no-face / alert / drowsy / critical),
//                count blinks, yawns, microsleeps and head nods, record the session.
//
// The page gets updates through callbacks:
//   onUpdate(state)          ~10 times per second
//   onAlarmStart(reason) / onAlarmStop()
//   onSample(features, t)    once per second (used by the Training page to record data)

import { SlidingWindow, WINDOW_SECONDS, calculateEAR, calculateMAR, computeWindowFeatures, estimateHeadPose } from './features.js';
import { DrowsinessClassifier } from './classifier.js';

const TARGET_FPS = 30;
const PREDICT_EVERY_MS = 200;
const UPDATE_EVERY_MS = 100;
const TIMELINE_EVERY_MS = 500;
const SMOOTHING = 0.35; // exponential moving average factor
const CALIBRATION_MS = 4000;

export const DEFAULT_SETTINGS = {
  earThreshold: 0.21,
  marThreshold: 0.5,
  microsleepSeconds: 1.0,
  drowsyProbability: 0.5,
  criticalProbability: 0.85,
};

export class Engine {
  constructor(detector, callbacks = {}) {
    this.detector = detector;
    this.cb = callbacks;
    this.settings = { ...DEFAULT_SETTINGS };
    this.alarmsEnabled = true;
    this.classifier = null;
    this.model = null;
    this.window = new SlidingWindow(WINDOW_SECONDS * 1000);
    this.pitchBaseline = 0;
    this.running = false;
    this.landmarks = null;
    this.resetCounters();
    this.session = null;
    this.calibration = null;
    this.snoozeUntil = 0;
    this.alarmOn = false;
    this.state = { status: 'no-face', probability: 0 };
  }

  setModel(model) {
    this.classifier = new DrowsinessClassifier(model);
    this.model = model;
  }

  resetCounters() {
    this.counts = { blinks: 0, yawns: 0, microsleeps: 0, alerts: 0, nods: 0 };
    this.events = [];
    this.timeline = [];
    this.probability = 0;
    this.features = null;
    this.prediction = null;
    this.status = 'no-face';
    this.lastFace = 0;
    this.lastPredict = 0;
    this.lastUpdate = 0;
    this.lastTimeline = 0;
    this.lastSample = 0;
    this.lastFrame = 0;
    this.fps = 0;
    this.closedSince = null;
    this.microsleepLogged = false;
    this.mouthOpenSince = null;
    this.yawnLogged = false;
    this.nodSince = null;
    this.nodLogged = false;
  }

  start(video) {
    this.video = video;
    this.running = true;
    const loop = async () => {
      if (!this.running) return;
      await this.tick(performance.now());
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  log(type, detail, now) {
    const t = this.session ? now - this.session.start : now;
    this.events.unshift({ t, type, detail });
    if (this.events.length > 100) this.events.pop();
  }

  async tick(now) {
    if (this.video.readyState < 2 || now - this.lastFrame < 1000 / TARGET_FPS) return;
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    this.fps = this.fps ? this.fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;

    const lm = await this.detector.detect(this.video);
    this.landmarks = lm;
    const s = this.settings;

    if (lm) {
      this.lastFace = now;
      const ear = calculateEAR(lm);
      const mar = calculateMAR(lm);
      const raw = estimateHeadPose(lm);
      const pose = { ...raw, pitch: raw.pitch - this.pitchBaseline };
      this.window.push({ t: now, ear: ear.mean, earLeft: ear.left, earRight: ear.right, mar, pose });

      if (this.calibration) {
        this.calibration.ears.push(ear.mean);
        this.calibration.mars.push(mar);
        this.calibration.pitches.push(raw.pitch);
      }

      this.detectEvents(now, ear.mean, mar, pose.pitch);

      if (now - this.lastPredict >= PREDICT_EVERY_MS && this.classifier) {
        this.lastPredict = now;
        this.features = computeWindowFeatures(this.window.frames, s);
        this.prediction = this.classifier.explain(this.features);
        this.probability = this.probability
          ? SMOOTHING * this.prediction.probability + (1 - SMOOTHING) * this.probability
          : this.prediction.probability;
      }

      if (this.features && this.cb.onSample && now - this.lastSample >= 1000) {
        this.lastSample = now;
        this.cb.onSample(this.features, Date.now());
      }
    }

    // ----- status -----
    const closure = this.window.currentClosureSeconds(s.earThreshold);
    let status;
    if (now - this.lastFace > 1000) status = 'no-face';
    else if (closure >= s.microsleepSeconds || this.probability >= s.criticalProbability) status = 'critical';
    else if (this.probability >= s.drowsyProbability) status = 'drowsy';
    else status = 'alert';

    if (status !== this.status) {
      if (status === 'critical') {
        this.counts.alerts++;
        this.log('critical', 'Alarm, probability ' + this.probability.toFixed(2), now);
      } else if (status === 'drowsy' && this.status === 'alert') {
        this.log('drowsy', 'Drowsiness rising, probability ' + this.probability.toFixed(2), now);
      }
      this.status = status;
    }

    // ----- alarm -----
    const shouldAlarm = status === 'critical' && this.alarmsEnabled && !this.calibration && now > this.snoozeUntil;
    const reason =
      closure >= s.microsleepSeconds
        ? `Eyes closed for ${closure.toFixed(1)} seconds`
        : `Drowsiness probability ${(this.probability * 100).toFixed(0)}%`;
    if (shouldAlarm && !this.alarmOn) {
      this.alarmOn = true;
      if (this.cb.onAlarmStart) this.cb.onAlarmStart(reason);
    } else if (!shouldAlarm && this.alarmOn) {
      this.alarmOn = false;
      if (this.cb.onAlarmStop) this.cb.onAlarmStop();
    }

    // ----- timeline / session -----
    if (lm && this.features && now - this.lastTimeline >= TIMELINE_EVERY_MS) {
      this.lastTimeline = now;
      const last = this.window.last();
      const point = {
        t: (now - (this.session ? this.session.start : 0)) / 1000,
        ear: last.ear,
        mar: last.mar,
        probability: this.probability,
        perclos: this.features.perclos,
      };
      this.timeline.push(point);
      while (this.timeline.length && point.t - this.timeline[0].t > 60) this.timeline.shift();
      if (this.session) {
        const ss = this.session;
        ss.timeline.push(point);
        ss.probSum += this.probability;
        ss.probMax = Math.max(ss.probMax, this.probability);
        ss.perclosSum += this.features.perclos;
        ss.n++;
      }
    }

    // ----- calibration -----
    if (this.calibration) {
      const progress = Math.min(1, (now - this.calibration.start) / CALIBRATION_MS);
      this.calibration.progress = progress;
      if (progress >= 1) this.finishCalibration();
    }

    if (now - this.lastUpdate >= UPDATE_EVERY_MS && this.cb.onUpdate) {
      this.lastUpdate = now;
      const last = this.window.last();
      this.state = {
        status,
        probability: this.probability,
        ear: last ? last.ear : 0,
        earLeft: last ? last.earLeft : 0,
        earRight: last ? last.earRight : 0,
        mar: last ? last.mar : 0,
        pose: last ? last.pose : { pitch: 0, yaw: 0, roll: 0 },
        features: this.features,
        contributions: this.prediction ? this.prediction.contributions : null,
        closure,
        fps: this.fps,
        counts: this.counts,
        events: this.events,
        timeline: this.timeline,
        calibration: this.calibration ? this.calibration.progress : null,
        alarmReason: reason,
      };
      this.cb.onUpdate(this.state);
    }
  }

  detectEvents(now, ear, mar, pitch) {
    const s = this.settings;
    // eye closure: short = blink, long = microsleep
    const closed = ear < s.earThreshold;
    if (closed && this.closedSince === null) {
      this.closedSince = now;
      this.microsleepLogged = false;
    }
    if (!closed && this.closedSince !== null) {
      if ((now - this.closedSince) / 1000 < s.microsleepSeconds) this.counts.blinks++;
      this.closedSince = null;
    }
    if (closed && !this.microsleepLogged && (now - this.closedSince) / 1000 >= s.microsleepSeconds) {
      this.microsleepLogged = true;
      this.counts.microsleeps++;
      this.log('microsleep', `Eyes closed for more than ${s.microsleepSeconds.toFixed(1)} s`, now);
    }
    // yawn: mouth open for at least 1 second
    const open = mar > s.marThreshold;
    if (open && this.mouthOpenSince === null) {
      this.mouthOpenSince = now;
      this.yawnLogged = false;
    }
    if (!open) this.mouthOpenSince = null;
    if (open && !this.yawnLogged && now - this.mouthOpenSince >= 1000) {
      this.yawnLogged = true;
      this.counts.yawns++;
      this.log('yawn', 'Yawn (MAR ' + mar.toFixed(2) + ')', now);
    }
    // head nod: head dropped more than 20 degrees for 0.7 s
    const nodding = pitch > 20;
    if (nodding && this.nodSince === null) {
      this.nodSince = now;
      this.nodLogged = false;
    }
    if (!nodding) this.nodSince = null;
    if (nodding && !this.nodLogged && now - this.nodSince > 700) {
      this.nodLogged = true;
      this.counts.nods++;
      this.log('head-nod', 'Head dropped ' + pitch.toFixed(0) + '°', now);
    }
  }

  calibrate() {
    this.calibration = { start: performance.now(), ears: [], mars: [], pitches: [], progress: 0 };
  }

  finishCalibration() {
    const c = this.calibration;
    this.calibration = null;
    if (!c || c.ears.length < 10) return false;
    const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    this.settings.earThreshold = clamp(median(c.ears) * 0.75, 0.12, 0.3);
    this.settings.marThreshold = clamp(median(c.mars) + 0.35, 0.35, 0.8);
    this.pitchBaseline = median(c.pitches);
    this.window.clear();
    if (this.cb.onCalibrated) this.cb.onCalibrated(this.settings);
    return true;
  }

  // "I'm awake" → stop the alarm and give 5 seconds before it can fire again
  acknowledge() {
    this.snoozeUntil = performance.now() + 5000;
    if (this.alarmOn) {
      this.alarmOn = false;
      if (this.cb.onAlarmStop) this.cb.onAlarmStop();
    }
  }

  startSession() {
    this.resetCounters();
    this.session = {
      start: performance.now(),
      startedAt: new Date().toISOString(),
      timeline: [],
      probSum: 0,
      probMax: 0,
      perclosSum: 0,
      n: 0,
    };
  }

  stopSession() {
    const ss = this.session;
    if (!ss) return null;
    this.session = null;
    // keep at most ~600 points so the upload stays small
    const step = Math.max(1, Math.ceil(ss.timeline.length / 600));
    return {
      client_id: crypto.randomUUID(),
      started_at: ss.startedAt,
      duration_seconds: (performance.now() - ss.start) / 1000,
      model_version: this.model ? this.model.name + '@' + this.model.version : 'unknown',
      avg_probability: ss.n ? ss.probSum / ss.n : 0,
      max_probability: ss.probMax,
      avg_perclos: ss.n ? ss.perclosSum / ss.n : 0,
      total_blinks: this.counts.blinks,
      total_yawns: this.counts.yawns,
      microsleeps: this.counts.microsleeps,
      alerts: this.counts.alerts,
      events: this.events.slice().reverse(),
      timeline: ss.timeline.filter((_, i) => i % step === 0),
    };
  }
}
