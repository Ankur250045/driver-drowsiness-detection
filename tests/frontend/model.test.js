import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DrowsinessClassifier } from '../../frontend/js/classifier.js';
import { FEATURE_NAMES } from '../../frontend/js/features.js';
import { binaryMetrics, rocAuc, timeBlockedSplit } from '../../frontend/js/metrics.js';
import { DISTRIBUTIONS, generateSynthetic } from '../../frontend/js/synthetic.js';
import { DRIVER_TYPES, isNight, settingsFor } from '../../frontend/js/drivers.js';

const model = JSON.parse(readFileSync(new URL('../../frontend/models/drowsiness_model.json', import.meta.url), 'utf8'));
const means = (cls) => Object.fromEntries(Object.entries(DISTRIBUTIONS[cls]).map(([k, [mu]]) => [k, mu]));

describe('model file', () => {
  it('uses the same features in the same order', () => {
    expect(model.features).toEqual(FEATURE_NAMES);
    expect(Object.keys(DISTRIBUTIONS.alert)).toEqual(FEATURE_NAMES);
    expect(model.layers[0].weights).toHaveLength(FEATURE_NAMES.length);
  });
});

describe('classifier', () => {
  const clf = new DrowsinessClassifier(model);

  it('logistic regression = sigmoid(w·z + b)', () => {
    const f = means('drowsy');
    const z = clf.standardize(f);
    const logit = z.reduce((s, v, i) => s + v * model.layers[0].weights[i][0], model.layers[0].bias[0]);
    expect(clf.predict(f)).toBeCloseTo(1 / (1 + Math.exp(-logit)), 10);
  });

  it('gives a drowsy window a higher probability than an alert one', () => {
    expect(clf.predict(means('alert'))).toBeLessThan(0.3);
    expect(clf.predict(means('drowsy'))).toBeGreaterThan(clf.predict(means('alert')));
  });

  it('explains a high PERCLOS as pushing towards drowsy', () => {
    expect(clf.explain({ ...means('alert'), perclos: 0.4 }).contributions.perclos).toBeGreaterThan(0);
  });

  it('rejects a model with unknown features', () => {
    expect(() => new DrowsinessClassifier({ ...model, features: ['nope'] })).toThrow(/unknown features/);
  });
});

describe('metrics', () => {
  it('confusion matrix, precision, recall', () => {
    const m = binaryMetrics([0, 0, 1, 1, 1], [0.1, 0.7, 0.8, 0.9, 0.2]);
    expect(m.confusion_matrix).toEqual([[1, 1], [1, 2]]);
    expect(m.precision).toBeCloseTo(2 / 3);
    expect(m.recall).toBeCloseTo(2 / 3);
  });

  it('ROC AUC: perfect 1, inverted 0', () => {
    expect(rocAuc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])).toBe(1);
    expect(rocAuc([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1])).toBe(0);
  });

  it('time-blocked split keeps the test set after the training set', () => {
    const samples = generateSynthetic(50, 1);
    const { train, test } = timeBlockedSplit(samples);
    for (const label of [0, 1]) {
      const lastTrain = Math.max(...train.filter((s) => s.label === label).map((s) => s.t));
      const firstTest = Math.min(...test.filter((s) => s.label === label).map((s) => s.t));
      expect(firstTest).toBeGreaterThan(lastTrain);
    }
  });
});

describe('driver types', () => {
  it('truck drivers get the most sensitive settings', () => {
    const day = new Date('2026-10-10T12:00:00');
    expect(settingsFor('truck', day).microsleepSeconds).toBeLessThan(settingsFor('personal', day).microsleepSeconds);
    expect(settingsFor('truck', day).criticalProbability).toBeLessThan(settingsFor('cab', day).criticalProbability);
    expect(DRIVER_TYPES.truck.breakRequired).toBe(true);
  });

  it('night mode lowers the thresholds for cab drivers but not personal drivers', () => {
    const night = new Date('2026-10-10T23:30:00');
    const day = new Date('2026-10-10T14:00:00');
    expect(isNight(night)).toBe(true);
    expect(settingsFor('cab', night).drowsyProbability).toBeLessThan(settingsFor('cab', day).drowsyProbability);
    expect(settingsFor('personal', night)).toEqual(settingsFor('personal', day));
  });
});
