// features.js
// Feature extraction from the 478 MediaPipe Face Mesh landmarks.
//
//  1. Per frame:  EAR (eye aspect ratio), MAR (mouth aspect ratio), head pose
//  2. Per window: 11 features over the last 10 seconds (PERCLOS, blink rate, ...)
//
// The feature list and order must match ml/feature_spec.json (checked by a test).

export const WINDOW_SECONDS = 10;

export const FEATURE_NAMES = [
  'ear_mean',
  'ear_std',
  'perclos',
  'blink_rate',
  'blink_duration_mean',
  'longest_closure',
  'mar_mean',
  'yawn_rate',
  'pitch_mean',
  'pitch_std',
  'yaw_std',
];

// Landmark indices: [p1 (outer corner), p2, p3, p4 (inner corner), p5, p6]
export const LEFT_EYE = [33, 160, 158, 133, 153, 144];
export const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
// three vertical pairs on the inner lips + the two mouth corners
export const MOUTH_VERTICAL = [
  [13, 14],
  [81, 178],
  [311, 402],
];
export const MOUTH_CORNERS = [78, 308];

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// EAR = (|p2 - p6| + |p3 - p5|) / (2 |p1 - p4|)   (Soukupova & Cech, 2016)
export function eyeAspectRatio(lm, idx) {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => lm[i]);
  const horizontal = distance(p1, p4);
  if (horizontal === 0) return 0;
  return (distance(p2, p6) + distance(p3, p5)) / (2 * horizontal);
}

export function calculateEAR(lm) {
  const left = eyeAspectRatio(lm, LEFT_EYE);
  const right = eyeAspectRatio(lm, RIGHT_EYE);
  return { left, right, mean: (left + right) / 2 };
}

// MAR = mean of the three vertical lip distances / mouth width
export function calculateMAR(lm) {
  const width = distance(lm[MOUTH_CORNERS[0]], lm[MOUTH_CORNERS[1]]);
  if (width === 0) return 0;
  let sum = 0;
  for (const [a, b] of MOUTH_VERTICAL) sum += distance(lm[a], lm[b]);
  return sum / MOUTH_VERTICAL.length / width;
}

// Head pose from the 3D mesh: x axis = eye line, y axis = forehead -> chin,
// face normal = x cross y. Positive pitch means the head is tilted down.
export function estimateHeadPose(lm) {
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const norm = (v) => {
    const n = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / n, y: v.y / n, z: v.z / n };
  };
  const cross = (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const xAxis = norm(sub(lm[263], lm[33]));
  const yAxis = norm(sub(lm[152], lm[10]));
  const n = norm(cross(xAxis, yAxis));
  const DEG = 180 / Math.PI;
  return {
    pitch: Math.atan2(-n.y, n.z) * DEG,
    yaw: Math.atan2(n.x, n.z) * DEG,
    roll: Math.atan2(xAxis.y, xAxis.x) * DEG,
  };
}

// ---------- window features ----------

function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

// Runs of consecutive frames where test(frame) is true.
// A run still going at the last frame is marked ongoing.
export function findSegments(frames, test) {
  const segments = [];
  let start = null;
  for (const f of frames) {
    const on = test(f);
    if (on && start === null) start = f.t;
    if (!on && start !== null) {
      segments.push({ start, end: f.t, ongoing: false });
      start = null;
    }
  }
  if (start !== null) segments.push({ start, end: frames[frames.length - 1].t, ongoing: true });
  return segments;
}

// frames: [{ t (ms), ear, mar, pose: {pitch, yaw, roll} }]
// th: { earThreshold, marThreshold, microsleepSeconds }
export function computeWindowFeatures(frames, th) {
  const ears = frames.map((f) => f.ear);
  const span = frames.length > 1 ? (frames[frames.length - 1].t - frames[0].t) / 1000 : 0;
  // use at least 5 s so the per-minute rates don't explode while the window fills up
  const perMinute = 60 / Math.max(span, 5);

  const closures = findSegments(frames, (f) => f.ear < th.earThreshold);
  const closureSeconds = closures.map((s) => (s.end - s.start) / 1000);
  let blinks = 0;
  closures.forEach((s, i) => {
    if (!s.ongoing && closureSeconds[i] > 0 && closureSeconds[i] < th.microsleepSeconds) blinks++;
  });
  const yawns = findSegments(frames, (f) => f.mar > th.marThreshold).filter((s) => (s.end - s.start) / 1000 >= 1);

  return {
    ear_mean: mean(ears),
    ear_std: std(ears),
    perclos: frames.length ? ears.filter((e) => e < th.earThreshold).length / frames.length : 0,
    blink_rate: blinks * perMinute,
    blink_duration_mean: mean(closureSeconds),
    longest_closure: closureSeconds.length ? Math.max(...closureSeconds) : 0,
    mar_mean: mean(frames.map((f) => f.mar)),
    yawn_rate: yawns.length * perMinute,
    pitch_mean: mean(frames.map((f) => f.pose.pitch)),
    pitch_std: std(frames.map((f) => f.pose.pitch)),
    yaw_std: std(frames.map((f) => f.pose.yaw)),
  };
}

// Keeps only the frames from the last `windowMs` milliseconds.
export class SlidingWindow {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.frames = [];
  }

  push(frame) {
    this.frames.push(frame);
    const cutoff = frame.t - this.windowMs;
    while (this.frames.length && this.frames[0].t < cutoff) this.frames.shift();
  }

  clear() {
    this.frames = [];
  }

  last() {
    return this.frames[this.frames.length - 1];
  }

  // seconds the eyes have been closed right now (0 if open)
  currentClosureSeconds(earThreshold) {
    const f = this.frames;
    if (!f.length || f[f.length - 1].ear >= earThreshold) return 0;
    let i = f.length - 1;
    while (i > 0 && f[i - 1].ear < earThreshold) i--;
    return (f[f.length - 1].t - f[i].t) / 1000;
  }
}
