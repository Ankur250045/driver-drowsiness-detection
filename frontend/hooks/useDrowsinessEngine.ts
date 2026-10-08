import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceDetectionService } from '@/services/faceDetection';
import { calculateEAR, calculateMAR, estimateHeadPose } from '@/services/featureExtraction';
import { SlidingWindow, computeWindowFeatures } from '@/services/windowFeatures';
import { DrowsinessClassifier, loadActiveModel, type Prediction } from '@/services/classifier';
import { AudioAlarm, haptics } from '@/services/audioAlarm';
import {
  WINDOW_SECONDS,
  type DetectionSettings,
  type DetectionStatus,
  type DrowsinessEvent,
  type FeatureVector,
  type FrameMeasurement,
  type HeadPose,
  type ModelArtifact,
  type Point3,
  type SessionSummary,
  type TimelinePoint,
} from '@/types';

export const DEFAULT_SETTINGS: DetectionSettings = {
  earThreshold: 0.21,
  marThreshold: 0.5,
  microsleepSeconds: 1.0,
  drowsyProbability: 0.5,
  criticalProbability: 0.85,
};

const TARGET_FPS = 30;
const PREDICT_EVERY_MS = 200;
const UI_UPDATE_EVERY_MS = 100;
const TIMELINE_EVERY_MS = 500;
const TIMELINE_KEEP_SECONDS = 60;
const EMA_ALPHA = 0.35;
const NO_FACE_AFTER_MS = 1000;
const CALIBRATION_MS = 4000;

// ---- shared, lazily-initialised resources (survive page navigation) ----
let detectorPromise: Promise<FaceDetectionService> | null = null;
function getDetector() {
  if (!detectorPromise) {
    const svc = new FaceDetectionService();
    detectorPromise = svc.initialize().then(() => svc);
    detectorPromise.catch(() => (detectorPromise = null));
  }
  return detectorPromise;
}

export interface LiveState {
  status: DetectionStatus;
  ear: number;
  earLeft: number;
  earRight: number;
  mar: number;
  pose: HeadPose;
  features: FeatureVector | null;
  prediction: Prediction | null;
  /** EMA-smoothed probability of drowsiness. */
  probability: number;
  closureSeconds: number;
  fps: number;
  inferenceMs: number;
  blinks: number;
  yawns: number;
  microsleeps: number;
  alerts: number;
  timeline: TimelinePoint[];
  events: DrowsinessEvent[];
}

const INITIAL_LIVE: LiveState = {
  status: 'no-face',
  ear: 0,
  earLeft: 0,
  earRight: 0,
  mar: 0,
  pose: { pitch: 0, yaw: 0, roll: 0 },
  features: null,
  prediction: null,
  probability: 0,
  closureSeconds: 0,
  fps: 0,
  inferenceMs: 0,
  blinks: 0,
  yawns: 0,
  microsleeps: 0,
  alerts: 0,
  timeline: [],
  events: [],
};

interface Options {
  video: HTMLVideoElement | null;
  /** Called about once per second with the current window features (Data Lab). */
  onSample?: (features: FeatureVector, t: number) => void;
  /** Disable alarm/overlay logic (e.g. while recording training data). */
  alarmsEnabled?: boolean;
}

export function useDrowsinessEngine({ video, onSample, alarmsEnabled = true }: Options) {
  const [stage, setStage] = useState<'loading-model' | 'ready' | 'error'>('loading-model');
  const [error, setError] = useState<string | null>(null);
  const [model, setModelState] = useState<ModelArtifact | null>(null);
  const [settings, setSettings] = useState<DetectionSettings>(DEFAULT_SETTINGS);
  const [live, setLive] = useState<LiveState>(INITIAL_LIVE);
  const [muted, setMuted] = useState(false);
  const [calibration, setCalibration] = useState<{ active: boolean; progress: number }>({
    active: false,
    progress: 0,
  });
  const [sessionActive, setSessionActive] = useState(false);
  const [alarmActive, setAlarmActive] = useState(false);
  /** Alarm start time (performance.now) and which on-device channels are actually working. */
  const [alarmInfo, setAlarmInfo] = useState({ since: 0, audio: false, haptics: false });
  const [backend, setBackend] = useState('');

  // Refs read inside the animation loop (avoid stale closures).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const alarmsEnabledRef = useRef(alarmsEnabled);
  alarmsEnabledRef.current = alarmsEnabled;
  const onSampleRef = useRef(onSample);
  onSampleRef.current = onSample;

  const detectorRef = useRef<FaceDetectionService | null>(null);
  const classifierRef = useRef<DrowsinessClassifier | null>(null);
  const alarmRef = useRef<AudioAlarm | null>(null);
  const landmarksRef = useRef<Point3[] | null>(null);
  const windowRef = useRef(new SlidingWindow(WINDOW_SECONDS * 1000));
  const pitchBaselineRef = useRef(0);
  const acknowledgedUntilRef = useRef(0);

  // Mutable per-run engine state.
  const engine = useRef({
    lastFrame: 0,
    lastFace: 0,
    lastPredict: 0,
    lastUi: 0,
    lastTimeline: 0,
    lastSample: 0,
    fps: 0,
    inferenceMs: 0,
    probability: 0,
    prediction: null as Prediction | null,
    features: null as FeatureVector | null,
    status: 'no-face' as DetectionStatus,
    prevClosed: false,
    closureStart: 0,
    microsleepLogged: false,
    prevMouthOpen: false,
    mouthOpenStart: 0,
    yawnLogged: false,
    noddingSince: 0,
    nodLogged: false,
    blinks: 0,
    yawns: 0,
    microsleeps: 0,
    alerts: 0,
    timeline: [] as TimelinePoint[],
    events: [] as DrowsinessEvent[],
    sessionStart: 0,
    sessionStartedAt: '',
    sessionTimeline: [] as TimelinePoint[],
    probSum: 0,
    probMax: 0,
    perclosSum: 0,
    nSamples: 0,
    calibration: null as null | { start: number; ears: number[]; mars: number[]; pitches: number[] },
    alarmSince: 0,
    lastVibrate: 0,
    audioOk: false,
    hapticsOk: false,
  });

  const setModel = useCallback((m: ModelArtifact) => {
    classifierRef.current = new DrowsinessClassifier(m);
    setModelState(m);
  }, []);

  // ---- initialise model + detector ----
  useEffect(() => {
    let cancelled = false;
    alarmRef.current = new AudioAlarm();
    (async () => {
      try {
        const [detector, artifact] = await Promise.all([getDetector(), loadActiveModel()]);
        if (cancelled) return;
        detectorRef.current = detector;
        setBackend(detector.backend);
        setModel(artifact);
        setStage('ready');
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStage('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      alarmRef.current?.stop();
    };
  }, [setModel]);

  const logEvent = useCallback((type: DrowsinessEvent['type'], detail: string, now: number) => {
    const e = engine.current;
    const t = e.sessionStart ? now - e.sessionStart : now;
    e.events = [{ t, type, detail }, ...e.events].slice(0, 100);
  }, []);

  // ---- main loop ----
  useEffect(() => {
    if (!video || stage !== 'ready') return;
    let raf = 0;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      const now = performance.now();
      const e = engine.current;
      const detector = detectorRef.current;

      if (!detector || video.readyState < 2 || now - e.lastFrame < 1000 / TARGET_FPS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = now - e.lastFrame;
      e.lastFrame = now;
      e.fps = e.fps ? e.fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;

      const t0 = performance.now();
      const lm = await detector.detectFace(video);
      e.inferenceMs = e.inferenceMs * 0.9 + (performance.now() - t0) * 0.1;
      if (stopped) return;
      landmarksRef.current = lm;
      const s = settingsRef.current;

      if (lm) {
        e.lastFace = now;
        const ear = calculateEAR(lm);
        const mar = calculateMAR(lm);
        const rawPose = estimateHeadPose(lm);
        const pose = { ...rawPose, pitch: rawPose.pitch - pitchBaselineRef.current };
        const frame: FrameMeasurement = {
          t: now,
          ear: ear.mean,
          earLeft: ear.left,
          earRight: ear.right,
          mar,
          pose,
        };
        windowRef.current.push(frame);

        // Calibration collects open-eye baseline.
        if (e.calibration) {
          e.calibration.ears.push(ear.mean);
          e.calibration.mars.push(mar);
          e.calibration.pitches.push(rawPose.pitch);
        }

        // ---- discrete event detection ----
        const closed = ear.mean < s.earThreshold;
        if (closed && !e.prevClosed) {
          e.closureStart = now;
          e.microsleepLogged = false;
        }
        if (!closed && e.prevClosed) {
          const dur = (now - e.closureStart) / 1000;
          if (dur < s.microsleepSeconds) e.blinks++;
        }
        if (closed && !e.microsleepLogged && (now - e.closureStart) / 1000 >= s.microsleepSeconds) {
          e.microsleepLogged = true;
          e.microsleeps++;
          logEvent('microsleep', `Eyes closed ≥ ${s.microsleepSeconds.toFixed(1)} s`, now);
        }
        e.prevClosed = closed;

        const mouthOpen = mar > s.marThreshold;
        if (mouthOpen && !e.prevMouthOpen) {
          e.mouthOpenStart = now;
          e.yawnLogged = false;
        }
        if (mouthOpen && !e.yawnLogged && now - e.mouthOpenStart >= 1000) {
          e.yawnLogged = true;
          e.yawns++;
          logEvent('yawn', `Yawn detected (MAR ${mar.toFixed(2)})`, now);
        }
        e.prevMouthOpen = mouthOpen;

        const nodding = pose.pitch > 20;
        if (nodding && !e.noddingSince) {
          e.noddingSince = now;
          e.nodLogged = false;
        }
        if (!nodding) e.noddingSince = 0;
        if (nodding && !e.nodLogged && now - e.noddingSince > 700) {
          e.nodLogged = true;
          logEvent('head-nod', `Head dropped ${pose.pitch.toFixed(0)}°`, now);
        }

        // ---- windowed features + model inference ----
        if (now - e.lastPredict >= PREDICT_EVERY_MS && classifierRef.current) {
          e.lastPredict = now;
          const features = computeWindowFeatures(windowRef.current.values, s);
          e.features = features;
          e.prediction = classifierRef.current.explain(features);
          e.probability = e.probability
            ? EMA_ALPHA * e.prediction.probability + (1 - EMA_ALPHA) * e.probability
            : e.prediction.probability;
        }

        if (e.features && onSampleRef.current && now - e.lastSample >= 1000) {
          e.lastSample = now;
          onSampleRef.current(e.features, Date.now());
        }
      }

      // ---- status state machine ----
      const closureSeconds = windowRef.current.currentClosureSeconds(s.earThreshold);
      let status: DetectionStatus;
      if (now - e.lastFace > NO_FACE_AFTER_MS) status = 'no-face';
      else if (closureSeconds >= s.microsleepSeconds || e.probability >= s.criticalProbability)
        status = 'critical';
      else if (e.probability >= s.drowsyProbability) status = 'drowsy';
      else status = 'alert';

      if (status !== e.status) {
        if (status === 'critical') {
          e.alerts++;
          logEvent('critical', `Critical — p=${e.probability.toFixed(2)}`, now);
        } else if (status === 'drowsy' && e.status === 'alert') {
          logEvent('drowsy', `Drowsiness rising — p=${e.probability.toFixed(2)}`, now);
        }
        e.status = status;
      }

      const shouldAlarm =
        status === 'critical' &&
        alarmsEnabledRef.current &&
        !e.calibration &&
        now > acknowledgedUntilRef.current;
      const alarm = alarmRef.current;
      if (shouldAlarm && !e.alarmSince) e.alarmSince = now;
      if (!shouldAlarm && e.alarmSince) {
        e.alarmSince = 0;
        haptics.stop();
      }
      if (shouldAlarm && !mutedRef.current && alarm && !alarm.getIsPlaying()) {
        alarm.play().then((ok) => (e.audioOk = ok));
      }
      if ((!shouldAlarm || mutedRef.current) && alarm?.getIsPlaying()) alarm.stop();
      if (shouldAlarm && now - e.lastVibrate > 2500) {
        e.lastVibrate = now;
        e.hapticsOk = haptics.alarm();
      }

      // ---- timeline + session aggregation ----
      if (lm && e.features && now - e.lastTimeline >= TIMELINE_EVERY_MS) {
        e.lastTimeline = now;
        const origin = e.sessionStart || 0;
        const point: TimelinePoint = {
          t: (now - origin) / 1000,
          ear: windowRef.current.values.at(-1)?.ear ?? 0,
          mar: windowRef.current.values.at(-1)?.mar ?? 0,
          probability: e.probability,
          perclos: e.features.perclos,
        };
        e.timeline = [...e.timeline, point].filter((p) => point.t - p.t <= TIMELINE_KEEP_SECONDS);
        if (e.sessionStart) {
          e.sessionTimeline.push(point);
          e.probSum += e.probability;
          e.probMax = Math.max(e.probMax, e.probability);
          e.perclosSum += e.features.perclos;
          e.nSamples++;
        }
      }

      // ---- calibration progress ----
      if (e.calibration) {
        const progress = Math.min(1, (now - e.calibration.start) / CALIBRATION_MS);
        setCalibration({ active: progress < 1, progress });
        if (progress >= 1) finishCalibration();
      }

      if (now - e.lastUi >= UI_UPDATE_EVERY_MS) {
        e.lastUi = now;
        const last = windowRef.current.values.at(-1);
        setLive({
          status,
          ear: last?.ear ?? 0,
          earLeft: last?.earLeft ?? 0,
          earRight: last?.earRight ?? 0,
          mar: last?.mar ?? 0,
          pose: last?.pose ?? INITIAL_LIVE.pose,
          features: e.features,
          prediction: e.prediction,
          probability: e.probability,
          closureSeconds,
          fps: e.fps,
          inferenceMs: e.inferenceMs,
          blinks: e.blinks,
          yawns: e.yawns,
          microsleeps: e.microsleeps,
          alerts: e.alerts,
          timeline: e.timeline,
          events: e.events,
        });
        setAlarmActive(shouldAlarm);
        setAlarmInfo({
          since: e.alarmSince,
          audio: shouldAlarm && !mutedRef.current && e.audioOk,
          haptics: shouldAlarm && e.hapticsOk,
        });
      }

      raf = requestAnimationFrame(tick);
    };

    const finishCalibration = () => {
      const c = engine.current.calibration;
      engine.current.calibration = null;
      if (!c || c.ears.length < 10) return;
      const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      const earBase = median(c.ears);
      const marBase = median(c.mars);
      pitchBaselineRef.current = median(c.pitches);
      windowRef.current.clear();
      setSettings((prev) => ({
        ...prev,
        earThreshold: clamp(earBase * 0.75, 0.12, 0.3),
        marThreshold: clamp(marBase + 0.35, 0.35, 0.8),
      }));
    };

    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      alarmRef.current?.stop();
    };
  }, [video, stage, logEvent]);

  const calibrate = useCallback(() => {
    engine.current.calibration = { start: performance.now(), ears: [], mars: [], pitches: [] };
    setCalibration({ active: true, progress: 0 });
  }, []);

  const acknowledge = useCallback(() => {
    acknowledgedUntilRef.current = performance.now() + 5000;
    alarmRef.current?.stop();
    haptics.stop();
    engine.current.alarmSince = 0;
    setAlarmActive(false);
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    pitchBaselineRef.current = 0;
  }, []);

  const startSession = useCallback(() => {
    const e = engine.current;
    Object.assign(e, {
      sessionStart: performance.now(),
      sessionStartedAt: new Date().toISOString(),
      sessionTimeline: [],
      probSum: 0,
      probMax: 0,
      perclosSum: 0,
      nSamples: 0,
      blinks: 0,
      yawns: 0,
      microsleeps: 0,
      alerts: 0,
      events: [],
      timeline: [],
    });
    setSessionActive(true);
  }, []);

  const stopSession = useCallback((): SessionSummary | null => {
    const e = engine.current;
    if (!e.sessionStart) return null;
    const summary: SessionSummary = {
      id: crypto.randomUUID(),
      startedAt: e.sessionStartedAt,
      durationSeconds: (performance.now() - e.sessionStart) / 1000,
      modelVersion: model ? `${model.name}@${model.version}` : 'unknown',
      avgProbability: e.nSamples ? e.probSum / e.nSamples : 0,
      maxProbability: e.probMax,
      avgPerclos: e.nSamples ? e.perclosSum / e.nSamples : 0,
      totalBlinks: e.blinks,
      totalYawns: e.yawns,
      microsleeps: e.microsleeps,
      alerts: e.alerts,
      events: e.events.slice().reverse(),
      // Downsample to keep payloads small (max ~600 points).
      timeline: downsample(e.sessionTimeline, 600),
    };
    e.sessionStart = 0;
    e.timeline = [];
    setSessionActive(false);
    return summary;
  }, [model]);

  return {
    stage,
    error,
    backend,
    model,
    setModel,
    settings,
    setSettings,
    resetSettings,
    live,
    landmarksRef,
    muted,
    setMuted,
    calibrate,
    calibration,
    acknowledge,
    alarmActive,
    alarmInfo,
    session: { active: sessionActive, start: startSession, stop: stopSession },
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function downsample<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs;
  const step = xs.length / max;
  return Array.from({ length: max }, (_, i) => xs[Math.floor(i * step)]);
}
