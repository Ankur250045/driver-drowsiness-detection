// trainer.js — trains a model in the browser with TensorFlow.js (window.tf).

import { FEATURE_NAMES } from './features.js';
import { binaryMetrics, fitScaler, timeBlockedSplit } from './metrics.js';

const toRow = (s) => FEATURE_NAMES.map((f) => s.features[f]);

// options: { architecture: 'mlp' | 'logistic_regression', epochs, learningRate, onEpoch(log) }
export async function trainModel(samples, options) {
  const tf = window.tf;
  const { train, test } = timeBlockedSplit(samples);
  const scaler = fitScaler(train.map(toRow));
  const standardize = (r) => r.map((v, j) => (v - scaler.mean[j]) / scaler.scale[j]);

  const xTrain = tf.tensor2d(train.map((s) => standardize(toRow(s))));
  const yTrain = tf.tensor2d(train.map((s) => [s.label]));
  const xTest = tf.tensor2d(test.map((s) => standardize(toRow(s))));
  const yTest = tf.tensor2d(test.map((s) => [s.label]));

  const model = tf.sequential();
  const d = FEATURE_NAMES.length;
  if (options.architecture === 'mlp') {
    model.add(tf.layers.dense({ inputShape: [d], units: 16, activation: 'relu' }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
  } else {
    model.add(
      tf.layers.dense({ inputShape: [d], units: 1, activation: 'sigmoid', kernelRegularizer: tf.regularizers.l2({ l2: 1e-3 }) }),
    );
  }
  model.compile({ optimizer: tf.train.adam(options.learningRate), loss: 'binaryCrossentropy', metrics: ['accuracy'] });

  await model.fit(xTrain, yTrain, {
    epochs: options.epochs,
    batchSize: 32,
    shuffle: true,
    validationData: [xTest, yTest],
    // default yielding uses requestAnimationFrame, which pauses in background tabs
    yieldEvery: 'never',
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        if (options.onEpoch) {
          options.onEpoch({
            epoch: epoch + 1,
            loss: logs.loss,
            valLoss: logs.val_loss,
            acc: logs.acc ?? logs.accuracy,
            valAcc: logs.val_acc ?? logs.val_accuracy,
          });
        }
        await new Promise((r) => setTimeout(r, 0));
      },
    },
  });

  const yProb = Array.from(model.predict(xTest).dataSync());
  const metrics = binaryMetrics(test.map((s) => s.label), yProb);

  // export weights in the same JSON format as the Python pipeline
  const layers = [];
  for (const layer of model.layers) {
    const w = layer.getWeights();
    if (w.length !== 2) continue; // dropout layer
    layers.push({
      weights: await w[0].array(),
      bias: Array.from(await w[1].data()),
      activation: layer.getConfig().activation || 'linear',
    });
  }
  tf.dispose([xTrain, yTrain, xTest, yTest]);
  model.dispose();

  const now = new Date();
  return {
    name: 'browser-' + options.architecture,
    version: now.toISOString().slice(0, 19).replace(/[-:T]/g, ''),
    type: options.architecture,
    trained: true,
    source: `Trained in the browser with TensorFlow.js on ${samples.length} examples (${options.epochs} epochs, learning rate ${options.learningRate}).`,
    features: FEATURE_NAMES,
    scaler,
    layers,
    metrics: { ...metrics, n_train: train.length, n_test: test.length },
    trained_at: now.toISOString(),
  };
}
