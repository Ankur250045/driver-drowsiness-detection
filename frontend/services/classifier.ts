import type { DenseLayer, FeatureVector, ModelArtifact } from '@/types';
import { FEATURE_NAMES } from '@/types';

const activations: Record<DenseLayer['activation'], (x: number) => number> = {
  relu: (x) => Math.max(0, x),
  sigmoid: (x) => 1 / (1 + Math.exp(-x)),
  linear: (x) => x,
  tanh: (x) => Math.tanh(x),
};

function forward(layers: DenseLayer[], input: number[]): number[] {
  let h = input;
  for (const layer of layers) {
    const out = layer.bias.slice();
    for (let i = 0; i < h.length; i++) {
      const row = layer.weights[i];
      for (let j = 0; j < out.length; j++) out[j] += h[i] * row[j];
    }
    const act = activations[layer.activation];
    h = out.map(act);
  }
  return h;
}

export interface Prediction {
  probability: number;
  /** Per-feature contribution to the probability (occlusion: value − value with feature at its mean). */
  contributions: Record<string, number>;
}

/** Feed-forward classifier that runs any exported ModelArtifact (LR or MLP) in pure JS. */
export class DrowsinessClassifier {
  constructor(readonly model: ModelArtifact) {
    const missing = model.features.filter((f) => !FEATURE_NAMES.includes(f));
    if (missing.length) throw new Error(`Model uses unknown features: ${missing.join(', ')}`);
  }

  standardize(features: FeatureVector): number[] {
    const { mean, scale } = this.model.scaler;
    return this.model.features.map(
      (name, i) => ((features as Record<string, number>)[name] - mean[i]) / (scale[i] || 1),
    );
  }

  predictStandardized(z: number[]): number {
    return forward(this.model.layers, z)[0];
  }

  predict(features: FeatureVector): number {
    return this.predictStandardized(this.standardize(features));
  }

  explain(features: FeatureVector): Prediction {
    const z = this.standardize(features);
    const probability = this.predictStandardized(z);
    const contributions: Record<string, number> = {};
    this.model.features.forEach((name, i) => {
      const occluded = z.slice();
      occluded[i] = 0; // feature set to its training mean
      contributions[name] = probability - this.predictStandardized(occluded);
    });
    return { probability, contributions };
  }
}

const CUSTOM_MODEL_KEY = 'drowsiguard.customModel';

export async function loadBundledModel(): Promise<ModelArtifact> {
  const res = await fetch('/models/drowsiness_model.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load model (${res.status})`);
  return res.json();
}

export function loadCustomModel(): ModelArtifact | null {
  try {
    const raw = localStorage.getItem(CUSTOM_MODEL_KEY);
    return raw ? (JSON.parse(raw) as ModelArtifact) : null;
  } catch {
    return null;
  }
}

export function saveCustomModel(model: ModelArtifact | null): void {
  try {
    if (model) localStorage.setItem(CUSTOM_MODEL_KEY, JSON.stringify(model));
    else localStorage.removeItem(CUSTOM_MODEL_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Custom (browser-trained) model takes precedence over the bundled one. */
export async function loadActiveModel(): Promise<ModelArtifact> {
  return loadCustomModel() ?? (await loadBundledModel());
}
