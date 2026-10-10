// metrics.js — evaluation helpers used after training (no TensorFlow needed).

export function binaryMetrics(yTrue, yProb, threshold = 0.5) {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  yTrue.forEach((y, i) => {
    const p = yProb[i] >= threshold ? 1 : 0;
    if (p === 1 && y === 1) tp++;
    else if (p === 0 && y === 0) tn++;
    else if (p === 1) fp++;
    else fn++;
  });
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    accuracy: (tp + tn) / yTrue.length,
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    roc_auc: rocAuc(yTrue, yProb),
    confusion_matrix: [
      [tn, fp],
      [fn, tp],
    ],
  };
}

// ROC AUC = probability that a random drowsy example scores higher than a random alert one
export function rocAuc(yTrue, yProb) {
  const pos = yProb.filter((_, i) => yTrue[i] === 1);
  const neg = yProb.filter((_, i) => yTrue[i] === 0);
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

// Examples overlap in time (sliding window), so a random split would leak.
// Keep the last `testFraction` of each class (by time) as the test set.
export function timeBlockedSplit(samples, testFraction = 0.2) {
  const train = [];
  const test = [];
  for (const label of [0, 1]) {
    const cls = samples.filter((s) => s.label === label).sort((a, b) => a.t - b.t);
    const nTest = Math.max(1, Math.round(cls.length * testFraction));
    train.push(...cls.slice(0, cls.length - nTest));
    test.push(...cls.slice(cls.length - nTest));
  }
  return { train, test };
}

export function fitScaler(rows) {
  const n = rows.length;
  const d = rows[0].length;
  const mean = new Array(d).fill(0);
  const scale = new Array(d).fill(0);
  rows.forEach((r) => r.forEach((v, j) => (mean[j] += v / n)));
  rows.forEach((r) => r.forEach((v, j) => (scale[j] += (v - mean[j]) ** 2 / n)));
  return { mean, scale: scale.map((v) => Math.sqrt(v) || 1) };
}
