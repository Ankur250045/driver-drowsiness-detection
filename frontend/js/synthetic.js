// synthetic.js
// Random example data for trying out training without recording yourself.
// Same distributions as ml/preprocessing/synthetic.py. NOT real data — never
// report accuracy measured on it.

import { FEATURE_NAMES } from './features.js';

// [mean, standard deviation] per feature
export const DISTRIBUTIONS = {
  alert: {
    ear_mean: [0.28, 0.035],
    ear_std: [0.035, 0.012],
    perclos: [0.06, 0.04],
    blink_rate: [15, 6],
    blink_duration_mean: [0.18, 0.07],
    longest_closure: [0.35, 0.25],
    mar_mean: [0.14, 0.07],
    yawn_rate: [0.3, 0.7],
    pitch_mean: [0, 6],
    pitch_std: [3, 1.5],
    yaw_std: [4, 2],
  },
  drowsy: {
    ear_mean: [0.25, 0.04],
    ear_std: [0.05, 0.02],
    perclos: [0.14, 0.08],
    blink_rate: [12, 6],
    blink_duration_mean: [0.32, 0.18],
    longest_closure: [0.9, 0.7],
    mar_mean: [0.19, 0.1],
    yawn_rate: [1.2, 1.4],
    pitch_mean: [4, 8],
    pitch_std: [4.2, 2.5],
    yaw_std: [4.5, 2.5],
  },
};

export const LABEL_NOISE = 0.05; // 5% of labels flipped on purpose

// small seeded random generator so results are repeatable
function seededRandom(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSynthetic(nPerClass = 200, seed = 42) {
  const rand = seededRandom(seed);
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
  const samples = [];
  const t0 = Date.now() - nPerClass * 2000;
  ['alert', 'drowsy'].forEach((cls, label) => {
    for (let i = 0; i < nPerClass; i++) {
      const features = {};
      for (const name of FEATURE_NAMES) {
        const [mu, sigma] = DISTRIBUTIONS[cls][name];
        let v = mu + sigma * gaussian();
        if (name !== 'pitch_mean') v = Math.max(0, v);
        if (name === 'perclos') v = Math.min(1, v);
        features[name] = v;
      }
      const noisy = rand() < LABEL_NOISE ? 1 - label : label;
      samples.push({ t: t0 + (label * nPerClass + i) * 1000, label: noisy, features });
    }
  });
  return samples;
}
