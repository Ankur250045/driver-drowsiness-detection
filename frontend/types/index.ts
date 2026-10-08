import featureSpec from '@ml/feature_spec.json';

export type DetectionStatus = 'no-face' | 'alert' | 'drowsy' | 'critical';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Head orientation in degrees. Positive pitch = head tilted down. */
export interface HeadPose {
  pitch: number;
  yaw: number;
  roll: number;
}

/** Per-frame measurements extracted from face landmarks. */
export interface FrameMeasurement {
  t: number; // ms timestamp (performance.now)
  ear: number;
  earLeft: number;
  earRight: number;
  mar: number;
  pose: HeadPose;
}

/** Ordered feature names — single source of truth lives in ml/feature_spec.json. */
export const FEATURE_NAMES: string[] = featureSpec.features.map((f) => f.name);
export const FEATURE_SPEC = featureSpec;
export const WINDOW_SECONDS: number = featureSpec.window_seconds;

export type FeatureName =
  | 'ear_mean'
  | 'ear_std'
  | 'perclos'
  | 'blink_rate'
  | 'blink_duration_mean'
  | 'longest_closure'
  | 'mar_mean'
  | 'yawn_rate'
  | 'pitch_mean'
  | 'pitch_std'
  | 'yaw_std';

export type FeatureVector = Record<FeatureName, number>;

export interface DetectionSettings {
  /** EAR below this = eye closed. Set by calibration. */
  earThreshold: number;
  /** MAR above this = mouth open (yawn candidate). */
  marThreshold: number;
  /** Continuous closure (s) treated as a microsleep → critical. */
  microsleepSeconds: number;
  /** Model probability above which the driver is considered drowsy. */
  drowsyProbability: number;
  /** Model probability above which an alarm fires. */
  criticalProbability: number;
}

export interface DenseLayer {
  /** Shape [inputs][outputs] */
  weights: number[][];
  bias: number[];
  activation: 'relu' | 'sigmoid' | 'linear' | 'tanh';
}

export interface ModelMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  roc_auc?: number;
  confusion_matrix?: number[][];
  n_train?: number;
  n_test?: number;
  [key: string]: unknown;
}

/** Portable model format exported by ml/training and by in-browser training. */
export interface ModelArtifact {
  name: string;
  version: string;
  type: 'logistic_regression' | 'mlp';
  trained: boolean;
  source: string;
  features: string[];
  scaler: { mean: number[]; scale: number[] };
  layers: DenseLayer[];
  metrics: ModelMetrics | null;
  trained_at: string | null;
}

export interface DrowsinessEvent {
  t: number; // ms since session start
  type: 'microsleep' | 'yawn' | 'drowsy' | 'critical' | 'head-nod';
  detail: string;
}

export interface TimelinePoint {
  t: number; // seconds since session start
  ear: number;
  mar: number;
  probability: number;
  perclos: number;
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  durationSeconds: number;
  modelVersion: string;
  avgProbability: number;
  maxProbability: number;
  avgPerclos: number;
  totalBlinks: number;
  totalYawns: number;
  microsleeps: number;
  alerts: number;
  events: DrowsinessEvent[];
  timeline: TimelinePoint[];
  synced?: boolean;
}

export interface LabeledSample {
  t: number;
  label: 0 | 1;
  features: FeatureVector;
}
