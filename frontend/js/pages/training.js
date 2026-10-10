import { api, requireUser } from '../api.js';
import { $, downloadFile, escapeHtml, renderHeader, toast } from '../common.js';
import { FEATURE_NAMES } from '../features.js';
import { Engine } from '../engine.js';
import { FaceDetector, drawLandmarks, startCamera, stopCamera } from '../detector.js';
import { loadActiveModel, loadDefaultModel, saveCustomModel } from '../classifier.js';
import { generateSynthetic } from '../synthetic.js';
import { trainModel } from '../trainer.js';

const user = await requireUser();
renderHeader(user);

const SAMPLES_KEY = 'dd.samples';
let samples = [];
try {
  samples = JSON.parse(localStorage.getItem(SAMPLES_KEY) || '[]');
} catch {
  samples = [];
}
let recording = null; // 0 = alert, 1 = drowsy
let stream = null;
let trained = null;

// ---------- recording ----------

const detector = new FaceDetector();
const engine = new Engine(detector, {
  onSample: (features, t) => {
    if (recording === null) return;
    samples.push({ t, label: recording, features });
    saveSamples();
  },
});
engine.alarmsEnabled = false;
loadActiveModel().then((m) => {
  engine.setModel(m);
  showModel(m);
});

const video = $('video');

$('camera-btn').addEventListener('click', async () => {
  if (stream) {
    engine.stop();
    stopCamera(stream);
    stream = null;
    recording = null;
    $('camera-btn').textContent = 'Turn camera on';
    $('camera-msg').textContent = 'Camera is off.';
    $('camera-msg').classList.remove('hidden');
    updateButtons();
    return;
  }
  try {
    $('camera-msg').textContent = 'Starting camera…';
    stream = await startCamera(video);
    $('camera-msg').textContent = 'Loading the face landmark model…';
    await detector.init();
    engine.start(video);
    $('camera-msg').classList.add('hidden');
    $('camera-btn').textContent = 'Turn camera off';
    updateButtons();
  } catch (err) {
    $('camera-msg').textContent = err.message;
  }
});

(function drawLoop() {
  if (video.videoWidth && stream) drawLandmarks($('overlay'), video, engine.landmarks, recording === 1 ? '#f44336' : '#4caf50');
  requestAnimationFrame(drawLoop);
})();

function toggleRecording(label) {
  recording = recording === label ? null : label;
  updateButtons();
}
$('rec-alert').addEventListener('click', () => toggleRecording(0));
$('rec-drowsy').addEventListener('click', () => toggleRecording(1));

function updateButtons() {
  const ready = !!stream;
  for (const [id, label, name] of [['rec-alert', 0, 'alert'], ['rec-drowsy', 1, 'drowsy']]) {
    const btn = $(id);
    const active = recording === label;
    btn.disabled = !ready || (recording !== null && !active);
    btn.className = active ? 'btn danger block' : 'btn block';
    btn.textContent = active ? `Stop recording "${name}"` : `Record "${name}"`;
  }
  $('hud').classList.toggle('hidden', recording === null);
  $('rec-label').textContent = recording === null ? '' : 'REC ' + (recording ? 'drowsy' : 'alert');
}

// ---------- dataset ----------

function saveSamples() {
  try {
    localStorage.setItem(SAMPLES_KEY, JSON.stringify(samples));
  } catch {
    // storage full
  }
  showDataset();
}

function showDataset() {
  const nAlert = samples.filter((s) => s.label === 0).length;
  const nDrowsy = samples.length - nAlert;
  $('n-alert').textContent = nAlert;
  $('n-drowsy').textContent = nDrowsy;
  $('dataset-title').textContent = `Dataset (${samples.length} rows)`;
  $('train-btn').disabled = nAlert < 10 || nDrowsy < 10;
  ['csv-btn', 'upload-btn', 'clear-btn'].forEach((id) => ($(id).disabled = !samples.length));
  if (!samples.length) {
    $('dataset').innerHTML = '<p class="muted">No data yet. Record some, or click "Add synthetic data" to try out training.</p>';
    return;
  }
  const rows = samples.slice(-50).reverse();
  $('dataset').innerHTML = `<div class="table-scroll"><table class="mono">
    <thead><tr><th>label</th>${FEATURE_NAMES.map((f) => `<th class="num">${f}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map(
        (s) => `<tr><td class="${s.label ? 'bad' : 'ok'}">${s.label ? 'drowsy' : 'alert'}</td>${FEATURE_NAMES.map(
          (f) => `<td class="num">${s.features[f].toFixed(3)}</td>`,
        ).join('')}</tr>`,
      )
      .join('')}</tbody></table></div>`;
}
showDataset();

$('synthetic-btn').addEventListener('click', () => {
  samples = samples.concat(generateSynthetic(150, Date.now() % 100000));
  saveSamples();
});

$('csv-btn').addEventListener('click', () => {
  const header = ['timestamp_ms', ...FEATURE_NAMES, 'label'].join(',');
  const lines = samples.map((s) => [Math.round(s.t), ...FEATURE_NAMES.map((f) => s.features[f].toFixed(6)), s.label].join(','));
  downloadFile(`drowsiness_dataset_${Date.now()}.csv`, [header, ...lines].join('\n'));
});

$('upload-btn').addEventListener('click', async () => {
  try {
    const res = await api.uploadSamples(samples);
    toast('Uploaded', res.stored + ' examples saved on the server.');
  } catch (err) {
    toast('Upload failed', err.message, true);
  }
});

$('clear-btn').addEventListener('click', () => {
  if (!confirm('Delete all recorded examples?')) return;
  samples = [];
  saveSamples();
});

// ---------- training ----------

$('epochs').addEventListener('input', () => ($('epochs-val').textContent = $('epochs').value));
const learningRate = () => Number((10 ** Number($('lr').value)).toPrecision(2));
$('lr').addEventListener('input', () => ($('lr-val').textContent = learningRate()));

let lossChart = null;
let accChart = null;

function lineChart(canvas, yMax) {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'train', data: [], borderColor: '#1a5aa6', pointRadius: 0, borderWidth: 2 },
        { label: 'test', data: [], borderColor: '#d9822b', pointRadius: 0, borderWidth: 2 },
      ],
    },
    options: { animation: false, maintainAspectRatio: false, scales: { y: yMax ? { min: 0, max: yMax } : { min: 0 } } },
  });
}

$('train-btn').addEventListener('click', async () => {
  const epochs = Number($('epochs').value);
  $('results-panel').classList.remove('hidden');
  $('metrics').innerHTML = '';
  if (lossChart) lossChart.destroy();
  if (accChart) accChart.destroy();
  lossChart = lineChart($('loss-chart'));
  accChart = lineChart($('acc-chart'), 1);
  const btn = $('train-btn');
  btn.disabled = true;
  try {
    trained = await trainModel(samples, {
      architecture: $('arch').value,
      epochs,
      learningRate: learningRate(),
      onEpoch: (log) => {
        btn.textContent = `Training… epoch ${log.epoch} of ${epochs}`;
        lossChart.data.labels.push(log.epoch);
        lossChart.data.datasets[0].data.push(log.loss);
        lossChart.data.datasets[1].data.push(log.valLoss);
        lossChart.update('none');
        accChart.data.labels.push(log.epoch);
        accChart.data.datasets[0].data.push(log.acc);
        accChart.data.datasets[1].data.push(log.valAcc);
        accChart.update('none');
      },
    });
    showResults(trained);
    toast('Training finished', 'Test accuracy ' + trained.metrics.accuracy.toFixed(3));
  } catch (err) {
    toast('Training failed', err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Train';
  }
});

function metricsTable(m) {
  const rows = [['Accuracy', m.accuracy], ['Precision', m.precision], ['Recall', m.recall], ['F1 score', m.f1], ['ROC AUC', m.roc_auc]];
  const cm = m.confusion_matrix;
  return `<table style="margin-top:12px"><tbody>${rows
    .map(([k, v]) => `<tr><td>${k}</td><td class="num">${v === undefined || Number.isNaN(v) ? '–' : v.toFixed(3)}</td></tr>`)
    .join('')}</tbody></table>
    ${
      cm
        ? `<table class="cm" style="margin-top:12px">
        <tr><th></th><th>Predicted alert</th><th>Predicted drowsy</th></tr>
        <tr><th>Actual alert</th><td class="hit mono">${cm[0][0]}</td><td class="miss mono">${cm[0][1]}</td></tr>
        <tr><th>Actual drowsy</th><td class="miss mono">${cm[1][0]}</td><td class="hit mono">${cm[1][1]}</td></tr>
      </table>`
        : ''
    }`;
}

function showResults(model) {
  const m = model.metrics;
  $('metrics').innerHTML =
    metricsTable(m) +
    `<p class="small muted">${m.n_train} training / ${m.n_test} test examples.</p>
     <div class="btn-row"><button class="btn primary" id="use-btn">Use this model</button>
     <button class="btn" id="download-model-btn">Download model</button></div>`;
  $('use-btn').addEventListener('click', () => {
    saveCustomModel(model);
    engine.setModel(model);
    showModel(model);
    toast('Model in use', 'The Monitor page now uses this model.');
  });
  $('download-model-btn').addEventListener('click', () =>
    downloadFile('drowsiness_model.json', JSON.stringify(model, null, 2), 'application/json'),
  );
}

// ---------- model info ----------

function showModel(model) {
  const sizes = [model.features.length, ...model.layers.map((l) => l.bias.length)];
  const params = model.layers.reduce((n, l) => n + l.weights.length * l.bias.length + l.bias.length, 0);
  let weightsHtml = '';
  if (model.layers.length === 1) {
    const w = model.features
      .map((f, i) => [f, model.layers[0].weights[i][0]])
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const max = Math.max(...w.map(([, v]) => Math.abs(v)));
    weightsHtml =
      '<h3 style="margin-top:12px">Weights</h3>' +
      w
        .map(
          ([f, v]) => `<div class="contrib"><span class="mono">${f}</span>
          <div class="track"><span class="${v >= 0 ? 'pos' : 'neg'}" style="width:${(Math.abs(v) / max) * 50}%"></span></div>
          <span class="val">${v.toFixed(2)}</span></div>`,
        )
        .join('') +
      '<p class="small muted" style="margin:6px 0 0">Red weights increase the drowsiness probability, green ones decrease it.</p>';
  }
  $('model-info').innerHTML = `
    ${model.trained ? '' : '<div class="notice">This is the <b>baseline model</b>: its weights were set by hand from values in research papers and it has not been trained on data yet.</div>'}
    <table class="kv"><tbody>
      <tr><td>Name</td><td>${escapeHtml(model.name)} (v${escapeHtml(model.version)})</td></tr>
      <tr><td>Type</td><td>${model.type === 'mlp' ? 'Neural network' : 'Logistic regression'}</td></tr>
      <tr><td>Layers</td><td class="mono">${sizes.join(' → ')}</td></tr>
      <tr><td>Parameters</td><td>${params}</td></tr>
      <tr><td>Trained</td><td>${model.trained_at ? new Date(model.trained_at).toLocaleString() : 'no'}</td></tr>
    </tbody></table>
    <p class="small muted">${escapeHtml(model.source)}</p>
    ${model.metrics ? '<h3>Test results</h3>' + metricsTable(model.metrics) : ''}
    ${weightsHtml}
    ${model.name.startsWith('browser-') ? '<button class="btn small" id="revert-btn" style="margin-top:10px">Switch back to the default model</button>' : ''}`;
  if ($('revert-btn')) {
    $('revert-btn').addEventListener('click', async () => {
      saveCustomModel(null);
      const m = await loadDefaultModel();
      engine.setModel(m);
      showModel(m);
      toast('Switched back to the default model');
    });
  }
}
