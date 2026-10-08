import * as tf from '@tensorflow/tfjs';
import type { DenseLayer, LabeledSample, ModelArtifact, ModelMetrics } from '@/types';
import { FEATURE_NAMES } from '@/types';

export type Architecture = 'logistic_regression' | 'mlp';

export interface EpochLog {
  epoch: number;
  loss: number;
  valLoss: number;
  acc: number;
  valAcc: number;
}

export interface TrainOptions {
  architecture: Architecture;
  epochs: number;
  learningRate: number;
  onEpoch?: (log: EpochLog) => void;
}

/**
 * Time-blocked split: samples are overlapping sliding windows, so a random split
 * would leak near-duplicates into the test set. Instead the last `testFraction`
 * of each class (chronologically) is held out.
 */
export function timeBlockedSplit(samples: LabeledSample[], testFraction = 0.2) {
  const train: LabeledSample[] = [];
  const test: LabeledSample[] = [];
  for (const label of [0, 1] as const) {
    const cls = samples.filter((s) => s.label === label).sort((a, b) => a.t - b.t);
    const nTest = Math.max(1, Math.round(cls.length * testFraction));
    train.push(...cls.slice(0, cls.length - nTest));
    test.push(...cls.slice(cls.length - nTest));
  }
  return { train, test };
}

export function fitScaler(rows: number[][]) {
  const n = rows.length;
  const d = rows[0].length;
  const mean = Array(d).fill(0);
  const scale = Array(d).fill(0);
  rows.forEach((r) => r.forEach((v, j) => (mean[j] += v / n)));
  rows.forEach((r) => r.forEach((v, j) => (scale[j] += (v - mean[j]) ** 2 / n)));
  return { mean, scale: scale.map((v) => Math.sqrt(v) || 1) };
}

export function binaryMetrics(yTrue: number[], yProb: number[], threshold = 0.5): ModelMetrics {
  let tp = 0, tn = 0, fp = 0, fn = 0;
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

/** ROC AUC via the Mann–Whitney U statistic. */
export function rocAuc(yTrue: number[], yProb: number[]): number {
  const pos = yProb.filter((_, i) => yTrue[i] === 1);
  const neg = yProb.filter((_, i) => yTrue[i] === 0);
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

const toRow = (s: LabeledSample) =>
  FEATURE_NAMES.map((f) => (s.features as Record<string, number>)[f]);

export async function trainModel(samples: LabeledSample[], opts: TrainOptions): Promise<ModelArtifact> {
  const { train, test } = timeBlockedSplit(samples);
  const scaler = fitScaler(train.map(toRow));
  const standardize = (r: number[]) => r.map((v, j) => (v - scaler.mean[j]) / scaler.scale[j]);

  const xTrain = tf.tensor2d(train.map((s) => standardize(toRow(s))));
  const yTrain = tf.tensor2d(train.map((s) => [s.label]));
  const xTest = tf.tensor2d(test.map((s) => standardize(toRow(s))));
  const yTest = tf.tensor2d(test.map((s) => [s.label]));

  const model = tf.sequential();
  const d = FEATURE_NAMES.length;
  if (opts.architecture === 'mlp') {
    model.add(tf.layers.dense({ inputShape: [d], units: 16, activation: 'relu' }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
  } else {
    model.add(
      tf.layers.dense({
        inputShape: [d],
        units: 1,
        activation: 'sigmoid',
        kernelRegularizer: tf.regularizers.l2({ l2: 1e-3 }),
      }),
    );
  }
  model.compile({
    optimizer: tf.train.adam(opts.learningRate),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy'],
  });

  await model.fit(xTrain, yTrain, {
    epochs: opts.epochs,
    batchSize: 32,
    shuffle: true,
    validationData: [xTest, yTest],
    // TF.js 'auto' yielding uses requestAnimationFrame, which stalls in background tabs.
    yieldEvery: 'never',
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        opts.onEpoch?.({
          epoch: epoch + 1,
          loss: logs?.loss ?? NaN,
          valLoss: logs?.val_loss ?? NaN,
          acc: (logs?.acc ?? logs?.accuracy ?? NaN) as number,
          valAcc: (logs?.val_acc ?? logs?.val_accuracy ?? NaN) as number,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    },
  });

  const yProb = Array.from((model.predict(xTest) as tf.Tensor).dataSync());
  const metrics = binaryMetrics(test.map((s) => s.label), yProb);

  // Export Dense layers (dropout has no weights) into the portable format.
  const layers: DenseLayer[] = [];
  for (const layer of model.layers) {
    const w = layer.getWeights();
    if (w.length !== 2) continue;
    const config = layer.getConfig() as { activation?: string };
    layers.push({
      weights: (await w[0].array()) as number[][],
      bias: Array.from(await w[1].data()),
      activation: (config.activation ?? 'linear') as DenseLayer['activation'],
    });
  }

  tf.dispose([xTrain, yTrain, xTest, yTest]);
  model.dispose();

  return {
    name: `browser-${opts.architecture}`,
    version: new Date().toISOString().slice(0, 19).replace(/[-:T]/g, ''),
    type: opts.architecture,
    trained: true,
    source: `Trained in-browser with TensorFlow.js on ${samples.length} labelled windows (${opts.epochs} epochs, Adam lr=${opts.learningRate}).`,
    features: FEATURE_NAMES,
    scaler,
    layers,
    metrics: { ...metrics, n_train: train.length, n_test: test.length },
    trained_at: new Date().toISOString(),
  };
}
