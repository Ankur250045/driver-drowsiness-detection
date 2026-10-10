// classifier.js
// Runs the exported model (models/drowsiness_model.json) with a plain forward pass.
// The same JSON file is produced by ml/training/train_classifier.py and by
// in-browser training, and is also used by the FastAPI backend.

import { FEATURE_NAMES } from './features.js';

const ACTIVATIONS = {
  relu: (x) => Math.max(0, x),
  sigmoid: (x) => 1 / (1 + Math.exp(-x)),
  linear: (x) => x,
  tanh: (x) => Math.tanh(x),
};

function forward(layers, input) {
  let h = input;
  for (const layer of layers) {
    const out = layer.bias.slice();
    for (let i = 0; i < h.length; i++) {
      for (let j = 0; j < out.length; j++) out[j] += h[i] * layer.weights[i][j];
    }
    h = out.map(ACTIVATIONS[layer.activation]);
  }
  return h[0];
}

export class DrowsinessClassifier {
  constructor(model) {
    const unknown = model.features.filter((f) => !FEATURE_NAMES.includes(f));
    if (unknown.length) throw new Error('Model uses unknown features: ' + unknown.join(', '));
    this.model = model;
  }

  standardize(features) {
    const { mean, scale } = this.model.scaler;
    return this.model.features.map((name, i) => (features[name] - mean[i]) / (scale[i] || 1));
  }

  predict(features) {
    return forward(this.model.layers, this.standardize(features));
  }

  // Probability plus how much each feature contributed: the change in probability
  // when that feature is replaced by its training mean (occlusion).
  explain(features) {
    const z = this.standardize(features);
    const probability = forward(this.model.layers, z);
    const contributions = {};
    this.model.features.forEach((name, i) => {
      const copy = z.slice();
      copy[i] = 0;
      contributions[name] = probability - forward(this.model.layers, copy);
    });
    return { probability, contributions };
  }
}

const CUSTOM_MODEL_KEY = 'dd.customModel';

export async function loadDefaultModel() {
  const res = await fetch('models/drowsiness_model.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load the model file (' + res.status + ')');
  return res.json();
}

export function loadCustomModel() {
  try {
    const raw = localStorage.getItem(CUSTOM_MODEL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCustomModel(model) {
  try {
    if (model) localStorage.setItem(CUSTOM_MODEL_KEY, JSON.stringify(model));
    else localStorage.removeItem(CUSTOM_MODEL_KEY);
  } catch {
    // storage not available
  }
}

// A model trained on the Training page is preferred over the default one.
export async function loadActiveModel() {
  return loadCustomModel() || (await loadDefaultModel());
}
