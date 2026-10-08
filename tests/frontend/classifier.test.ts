import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DrowsinessClassifier } from '@/services/classifier';
import { binaryMetrics, rocAuc, timeBlockedSplit } from '@/services/trainer';
import { SYNTHETIC_DISTRIBUTIONS, generateSynthetic } from '@/services/syntheticData';
import { FEATURE_NAMES, type FeatureVector, type ModelArtifact } from '@/types';

const root = path.resolve(import.meta.dirname, '..', '..');
const bundled: ModelArtifact = JSON.parse(
  readFileSync(path.join(root, 'frontend', 'public', 'models', 'drowsiness_model.json'), 'utf8'),
);

const means = (cls: 'alert' | 'drowsy') =>
  Object.fromEntries(Object.entries(SYNTHETIC_DISTRIBUTIONS[cls]).map(([k, [mu]]) => [k, mu])) as FeatureVector;

describe('feature contract', () => {
  it('bundled model, feature spec and synthetic generator agree on feature order', () => {
    expect(bundled.features).toEqual(FEATURE_NAMES);
    expect(Object.keys(SYNTHETIC_DISTRIBUTIONS.alert)).toEqual(FEATURE_NAMES);
    expect(bundled.scaler.mean).toHaveLength(FEATURE_NAMES.length);
    expect(bundled.layers[0].weights).toHaveLength(FEATURE_NAMES.length);
  });
});

describe('DrowsinessClassifier', () => {
  const clf = new DrowsinessClassifier(bundled);

  it('logistic regression forward pass equals σ(w·z + b)', () => {
    const f = means('drowsy');
    const z = clf.standardize(f);
    const logit = z.reduce((s, v, i) => s + v * bundled.layers[0].weights[i][0], bundled.layers[0].bias[0]);
    expect(clf.predict(f)).toBeCloseTo(1 / (1 + Math.exp(-logit)), 10);
  });

  it('ranks a typical drowsy window above a typical alert one', () => {
    expect(clf.predict(means('alert'))).toBeLessThan(0.3);
    expect(clf.predict(means('drowsy'))).toBeGreaterThan(clf.predict(means('alert')));
  });

  it('PERCLOS contributes towards drowsy when it is high', () => {
    const { contributions } = clf.explain({ ...means('alert'), perclos: 0.4 });
    expect(contributions.perclos).toBeGreaterThan(0);
  });

  it('runs a multi-layer (MLP) artifact', () => {
    const mlp: ModelArtifact = {
      ...bundled,
      type: 'mlp',
      layers: [
        { weights: FEATURE_NAMES.map(() => [1, -1]), bias: [0, 0], activation: 'relu' },
        { weights: [[1], [1]], bias: [-1], activation: 'sigmoid' },
      ],
    };
    const p = new DrowsinessClassifier(mlp).predict(means('alert'));
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it('rejects artifacts with unknown features', () => {
    expect(() => new DrowsinessClassifier({ ...bundled, features: ['nope'] })).toThrow(/unknown features/);
  });
});

describe('evaluation metrics', () => {
  it('computes confusion matrix, precision, recall, F1', () => {
    const m = binaryMetrics([0, 0, 1, 1, 1], [0.1, 0.7, 0.8, 0.9, 0.2]);
    expect(m.confusion_matrix).toEqual([[1, 1], [1, 2]]);
    expect(m.precision).toBeCloseTo(2 / 3);
    expect(m.recall).toBeCloseTo(2 / 3);
    expect(m.accuracy).toBeCloseTo(0.6);
  });

  it('ROC-AUC: perfect = 1, inverted = 0, ties = 0.5', () => {
    expect(rocAuc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])).toBe(1);
    expect(rocAuc([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1])).toBe(0);
    expect(rocAuc([0, 1], [0.5, 0.5])).toBe(0.5);
  });
});

describe('timeBlockedSplit', () => {
  it('holds out the chronologically last 20% of each class', () => {
    const samples = generateSynthetic(50, 1);
    const { train, test } = timeBlockedSplit(samples);
    for (const label of [0, 1]) {
      const lastTrain = Math.max(...train.filter((s) => s.label === label).map((s) => s.t));
      const firstTest = Math.min(...test.filter((s) => s.label === label).map((s) => s.t));
      expect(firstTest).toBeGreaterThan(lastTrain);
    }
    expect(train.length + test.length).toBe(samples.length);
  });
});
