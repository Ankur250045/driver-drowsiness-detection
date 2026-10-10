import { api, requireUser } from '../api.js';
import { $, escapeHtml, formatClock, renderHeader, toast } from '../common.js';
import { DRIVER_TYPES, isNight, settingsFor } from '../drivers.js';
import { Engine } from '../engine.js';
import { FaceDetector, drawLandmarks, startCamera } from '../detector.js';
import { loadActiveModel } from '../classifier.js';
import { Alarm, SLEEPY_MESSAGE, phoneVibration, voice } from '../alarm.js';
import { alertWatch, bluetoothWatch } from '../watch.js';

const user = await requireUser();
renderHeader(user);
const type = user.driver_type;
const profile = DRIVER_TYPES[type];

const STATUS_TEXT = { 'no-face': 'No face', alert: 'Alert', drowsy: 'Drowsy', critical: 'Critical' };
const STATUS_COLOR = { 'no-face': '#777777', alert: '#2e7d32', drowsy: '#b36b00', critical: '#c62828' };
const MESH_COLOR = { 'no-face': '#bbbbbb', alert: '#4caf50', drowsy: '#ffb300', critical: '#f44336' };

$('driver-line').textContent =
  `Driving as: ${profile.label}` + (user.vehicle_number ? ` · Vehicle ${user.vehicle_number}` : '') +
  '. Click Calibrate once, then Start driving.';

// ---------- set up camera, model and engine ----------

const detector = new FaceDetector();
const alarm = new Alarm();
let alertSettings = null;
let lastState = null;

const engine = new Engine(detector, {
  onUpdate: (state) => {
    lastState = state;
    updateScreen(state);
  },
  onAlarmStart: startAlarm,
  onAlarmStop: stopAlarm,
  onCalibrated: () => {
    renderSettings();
    toast('Calibration done', `Eye threshold set to ${engine.settings.earThreshold.toFixed(3)}`);
  },
});
applyDriverSettings();

const video = $('video');
try {
  await startCamera(video);
  $('camera-msg').textContent = 'Loading the face landmark model (about 10 MB, only the first time)…';
} catch (err) {
  const denied = err.name === 'NotAllowedError' || err.name === 'SecurityError';
  $('camera-msg').textContent = denied
    ? 'Camera permission was denied. Allow camera access in the browser and reload the page.'
    : err.message;
}

try {
  const [model] = await Promise.all([loadActiveModel(), detector.init()]);
  engine.setModel(model);
  $('model-line').innerHTML =
    `Model: <a href="training.html">${escapeHtml(model.name)}</a> v${escapeHtml(model.version)}` +
    (model.trained ? '' : ' (untrained baseline)');
  if (video.srcObject) {
    engine.start(video);
    $('calibrate-btn').disabled = false;
    $('session-btn').disabled = false;
    $('hud').classList.remove('hidden');
  }
} catch (err) {
  $('error-box').textContent = 'Could not load the face landmark model: ' + err.message;
  $('error-box').classList.remove('hidden');
}

api
  .alertSettings()
  .then((s) => (alertSettings = s))
  .catch(() => {});

// draw the landmarks on top of the video
(function drawLoop() {
  if (video.videoWidth) {
    const show = $('show-mesh').checked;
    drawLandmarks($('overlay'), video, show ? engine.landmarks : null, MESH_COLOR[engine.status]);
  }
  requestAnimationFrame(drawLoop);
})();

// ---------- driver-type settings (night mode for cab/truck) ----------

function applyDriverSettings() {
  Object.assign(engine.settings, settingsFor(type));
  $('night-box').classList.toggle('hidden', !(profile.nightMode && isNight()));
}
setInterval(() => {
  applyDriverSettings();
  renderSettings();
}, 60 * 1000);

// ---------- screen updates ----------

const probChart = makeChart($('prob-chart'), [
  { label: 'probability', color: '#1a5aa6' },
  { label: 'drowsy threshold', color: '#b36b00', dashed: true },
  { label: 'alarm threshold', color: '#c62828', dashed: true },
], { min: 0, max: 1 });
const signalChart = makeChart($('signal-chart'), [
  { label: 'EAR', color: '#2e7d32' },
  { label: 'MAR', color: '#d9822b' },
  { label: 'PERCLOS', color: '#555555' },
], { min: 0 });

function makeChart(canvas, series, yRange) {
  return new Chart(canvas, {
    type: 'line',
    data: {
      datasets: series.map((s) => ({
        label: s.label,
        data: [],
        borderColor: s.color,
        borderWidth: s.dashed ? 1 : 2,
        borderDash: s.dashed ? [5, 4] : [],
        pointRadius: 0,
        tension: 0,
      })),
    },
    options: {
      animation: false,
      maintainAspectRatio: false,
      scales: {
        x: { type: 'linear', ticks: { callback: (v) => Math.round(v) + 's' } },
        y: yRange,
      },
      plugins: { legend: { labels: { boxWidth: 14, font: { size: 11 } } } },
    },
  });
}

let lastChartUpdate = 0;
let lastStatus = 'no-face';
let lastSpoken = -Infinity;
const now = () => performance.now();

function setBar(id, level, cls) {
  const el = $(id);
  el.style.width = Math.max(0, Math.min(1, level)) * 100 + '%';
  el.className = cls || '';
}

function updateScreen(st) {
  const s = engine.settings;
  // risk meter
  const p = st.status === 'no-face' ? 0 : st.probability;
  $('risk-percent').textContent = st.status === 'no-face' ? '–' : Math.round(p * 100) + '%';
  $('risk-percent').style.color = STATUS_COLOR[st.status];
  $('risk-bar').style.width = p * 100 + '%';
  $('risk-bar').style.background = STATUS_COLOR[st.status];
  $('tick-drowsy').style.left = s.drowsyProbability * 100 + '%';
  $('tick-critical').style.left = s.criticalProbability * 100 + '%';
  $('status-label').textContent = STATUS_TEXT[st.status];
  $('status-label').className = 'status-label bg-' + st.status;
  $('camera').className = 'camera status-' + st.status;
  $('camera-msg').classList.toggle('hidden', st.status !== 'no-face' || !!st.calibration);
  if (st.status === 'no-face') $('camera-msg').textContent = 'No face detected. Sit in front of the camera.';

  // "Driver sleepy — stop and hydrate" banner, spoken once when drowsiness starts
  const sleepy = st.status === 'drowsy' || st.status === 'critical';
  $('sleepy-box').classList.toggle('hidden', !sleepy);
  $('sleepy-box').classList.toggle('critical', st.status === 'critical');
  if (st.status === 'drowsy' && lastStatus === 'alert' && !alarm.muted && now() - lastSpoken > 30000) {
    voice.speak(SLEEPY_MESSAGE);
    lastSpoken = now();
  }
  lastStatus = st.status;

  // counters
  $('c-blinks').textContent = st.counts.blinks;
  $('c-yawns').textContent = st.counts.yawns;
  $('c-micro').textContent = st.counts.microsleeps;
  $('c-alerts').textContent = st.counts.alerts;

  // stat boxes
  const earCls = st.status === 'no-face' ? '' : st.ear < s.earThreshold ? 'bad' : 'ok';
  $('ear').textContent = st.ear.toFixed(3);
  $('ear').className = 'value ' + earCls;
  setBar('ear-bar', st.ear / 0.4, earCls);
  $('ear-hint').textContent = `left ${st.earLeft.toFixed(2)}, right ${st.earRight.toFixed(2)}`;
  $('mar').textContent = st.mar.toFixed(3);
  setBar('mar-bar', st.mar, st.mar > s.marThreshold ? 'warn' : '');
  $('mar-hint').textContent = st.counts.yawns + ' yawns';
  const perclos = st.features ? st.features.perclos : 0;
  const pCls = perclos > 0.15 ? 'bad' : perclos > 0.08 ? 'warn' : 'ok';
  $('perclos').textContent = (perclos * 100).toFixed(1) + ' %';
  $('perclos').className = 'value ' + pCls;
  setBar('perclos-bar', perclos / 0.4, pCls);
  $('pitch').textContent = st.pose.pitch.toFixed(0) + '°';
  $('pitch').className = 'value ' + (st.pose.pitch > 20 ? 'warn' : '');
  $('pose-hint').textContent = `yaw ${st.pose.yaw.toFixed(0)}°, roll ${st.pose.roll.toFixed(0)}°`;
  $('fps').textContent = st.fps.toFixed(0) + ' fps';

  // calibration progress
  $('calib-box').classList.toggle('hidden', st.calibration === null);
  if (st.calibration !== null) $('calib-progress').value = st.calibration;

  // charts (twice a second is enough)
  if (now() - lastChartUpdate > 500 && st.timeline.length) {
    lastChartUpdate = now();
    const tl = st.timeline;
    const first = tl[0].t;
    const last = tl[tl.length - 1].t;
    probChart.data.datasets[0].data = tl.map((q) => ({ x: q.t, y: q.probability }));
    probChart.data.datasets[1].data = [{ x: first, y: s.drowsyProbability }, { x: last, y: s.drowsyProbability }];
    probChart.data.datasets[2].data = [{ x: first, y: s.criticalProbability }, { x: last, y: s.criticalProbability }];
    probChart.update('none');
    signalChart.data.datasets[0].data = tl.map((q) => ({ x: q.t, y: q.ear }));
    signalChart.data.datasets[1].data = tl.map((q) => ({ x: q.t, y: q.mar }));
    signalChart.data.datasets[2].data = tl.map((q) => ({ x: q.t, y: q.perclos }));
    signalChart.update('none');
    renderContributions(st);
    renderEvents(st.events);
  }
}

const FEATURE_LABEL = {
  ear_mean: 'EAR mean', ear_std: 'EAR std. dev.', perclos: 'PERCLOS', blink_rate: 'Blink rate',
  blink_duration_mean: 'Blink duration', longest_closure: 'Longest closure', mar_mean: 'MAR mean',
  yawn_rate: 'Yawn rate', pitch_mean: 'Head pitch', pitch_std: 'Pitch std. dev.', yaw_std: 'Yaw std. dev.',
};

function formatFeature(name, v) {
  if (name === 'perclos') return (v * 100).toFixed(0) + '%';
  if (name.includes('rate')) return v.toFixed(1) + '/min';
  if (name.includes('pitch') || name.includes('yaw')) return v.toFixed(1) + '°';
  if (name.includes('duration') || name.includes('closure')) return v.toFixed(2) + ' s';
  return v.toFixed(3);
}

function renderContributions(st) {
  if (!st.contributions) return;
  const entries = Object.entries(st.contributions).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const max = Math.max(0.05, ...entries.map(([, c]) => Math.abs(c)));
  $('contrib').innerHTML =
    entries
      .map(
        ([name, c]) => `<div class="contrib">
          <span>${FEATURE_LABEL[name] || name}</span>
          <div class="track"><span class="${c >= 0 ? 'pos' : 'neg'}" style="width:${(Math.abs(c) / max) * 50}%"></span></div>
          <span class="val">${formatFeature(name, st.features[name])}</span>
        </div>`,
      )
      .join('') + '<p class="small muted" style="margin:8px 0 0">Green pushes towards alert, red towards drowsy.</p>';
}

const EVENT_LABEL = {
  microsleep: ['Microsleep', 'bad'], critical: ['Alarm', 'bad'], drowsy: ['Drowsy', 'warn'],
  yawn: ['Yawn', 'warn'], 'head-nod': ['Head nod', 'warn'], break: ['Break', 'ok'],
};

function renderEvents(events) {
  if (!events.length) return;
  $('events').innerHTML = events
    .map((e) => {
      const [label, cls] = EVENT_LABEL[e.type] || [e.type, ''];
      return `<li><span class="type ${cls}">${label}</span><span>${escapeHtml(e.detail)}</span><span class="time">${formatClock(e.t)}</span></li>`;
    })
    .join('');
}

// ---------- settings panel ----------

const SLIDERS = [
  ['earThreshold', 'Eye closed below EAR', 0.1, 0.35, 0.005, (v) => v.toFixed(3)],
  ['marThreshold', 'Yawn above MAR', 0.3, 1, 0.01, (v) => v.toFixed(2)],
  ['microsleepSeconds', 'Microsleep after', 0.5, 3, 0.1, (v) => v.toFixed(1) + ' s'],
  ['drowsyProbability', '"Drowsy" above probability', 0.2, 0.9, 0.01, (v) => v.toFixed(2)],
  ['criticalProbability', 'Alarm above probability', 0.5, 0.99, 0.01, (v) => v.toFixed(2)],
];

function renderSettings() {
  const s = engine.settings;
  $('settings').innerHTML =
    `<p class="small muted">Defaults for a ${profile.label.toLowerCase()}. Calibration sets the EAR and MAR values for your face.</p>` +
    SLIDERS.map(
      ([key, label, min, max, step, fmt]) => `<div class="field">
        <div class="label-row"><label for="set-${key}">${label}</label><span class="mono" id="val-${key}">${fmt(s[key])}</span></div>
        <input type="range" id="set-${key}" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}" />
      </div>`,
    ).join('') +
    `<div class="btn-row"><button class="btn" id="mute-btn">${alarm.muted ? 'Unmute alarm' : 'Mute alarm'}</button>
     <button class="btn" id="reset-btn">Reset to defaults</button></div>`;
  SLIDERS.forEach(([key, , , , , fmt]) => {
    $('set-' + key).addEventListener('input', (e) => {
      engine.settings[key] = Number(e.target.value);
      $('val-' + key).textContent = fmt(engine.settings[key]);
    });
  });
  $('mute-btn').addEventListener('click', () => {
    alarm.muted = !alarm.muted;
    if (alarm.muted) alarm.stop();
    renderSettings();
  });
  $('reset-btn').addEventListener('click', () => {
    engine.settings.earThreshold = 0.21;
    engine.settings.marThreshold = 0.5;
    engine.pitchBaseline = 0;
    applyDriverSettings();
    renderSettings();
  });
}
renderSettings();

$('calibrate-btn').addEventListener('click', () => {
  alarm.unlock();
  engine.calibrate();
});

// ---------- driving session + driver-specific panel ----------

const drive = {
  active: false,
  drivingMs: 0, // total driving time in this session
  sinceBreakMs: 0, // continuous driving since the last (complete) break
  onBreak: false,
  breakStart: 0,
  reminded: false,
  passenger: false,
  last: 0,
};

function renderDriverPanel() {
  const breakEvery = profile.breakEveryMinutes * 60 * 1000;
  $('driver-panel-title').textContent = type === 'truck' ? 'Driving hours' : type === 'cab' ? 'Shift' : 'Trip';
  let html = '';
  if (type === 'personal') {
    html = `
      <div class="small muted">Trip time</div>
      <div class="timer" id="t-total">00:00</div>
      <div class="small">Next break suggested in <b id="t-next">${formatClock(breakEvery)}</b></div>
      <div class="progress-line"><span id="t-progress"></span></div>
      <button class="btn small" id="break-btn">I took a break</button>`;
  } else if (type === 'cab') {
    html = `
      <table class="kv"><tbody>
        <tr><td>Shift time</td><td class="mono" id="t-total">00:00</td></tr>
        <tr><td>Since last break</td><td class="mono" id="t-since">00:00</td></tr>
      </tbody></table>
      <div class="progress-line"><span id="t-progress"></span></div>
      <div class="small muted">A 15-minute break is recommended every 2 hours.</div>
      <div class="field" style="margin-top:10px">
        <label class="check"><input type="checkbox" id="passenger" /> Passenger on board</label>
        <div class="help">Quieter alarm: the watch vibrates first and the sound starts after 2 seconds.</div>
      </div>
      <button class="btn small" id="break-btn">I took a break</button>`;
  } else {
    html = `
      <div class="small muted">Continuous driving since last break</div>
      <div class="timer"><span id="t-since">00:00</span> <span class="small muted">/ ${formatClock(breakEvery)}</span></div>
      <div class="progress-line"><span id="t-progress"></span></div>
      <table class="kv small"><tbody>
        <tr><td>Total driving this session</td><td class="mono" id="t-total">00:00</td></tr>
        <tr><td>Break status</td><td id="t-break">driving</td></tr>
      </tbody></table>
      <p class="small muted" style="margin:6px 0 10px">After 4 h 30 min of driving a break of at least ${profile.breakLengthMinutes} minutes is compulsory. Alarms are paused during the break.</p>
      <button class="btn small" id="break-btn">Start break</button>`;
  }
  $('driver-panel').innerHTML = html;
  $('break-btn').addEventListener('click', onBreakButton);
  if ($('passenger')) $('passenger').addEventListener('change', (e) => (drive.passenger = e.target.checked));
}
renderDriverPanel();

function onBreakButton() {
  if (type !== 'truck') {
    drive.sinceBreakMs = 0;
    drive.reminded = false;
    $('break-box').classList.add('hidden');
    engine.log('break', 'Break taken', performance.now());
    toast('Break noted', 'Timer reset.');
    return;
  }
  // truck: start / end a timed break
  if (!drive.onBreak) {
    drive.onBreak = true;
    drive.breakStart = Date.now();
    engine.alarmsEnabled = false;
    $('break-btn').textContent = 'End break';
    engine.log('break', 'Break started', performance.now());
  } else {
    const minutes = (Date.now() - drive.breakStart) / 60000;
    drive.onBreak = false;
    engine.alarmsEnabled = true;
    $('break-btn').textContent = 'Start break';
    if (minutes >= profile.breakLengthMinutes) {
      drive.sinceBreakMs = 0;
      drive.reminded = false;
      $('break-box').classList.add('hidden');
      toast('Break complete', 'Driving timer reset.');
    } else {
      toast('Break too short', `Only ${minutes.toFixed(0)} of ${profile.breakLengthMinutes} minutes — the driving timer was not reset.`, true);
    }
    engine.log('break', `Break ended after ${minutes.toFixed(0)} min`, performance.now());
  }
}

setInterval(() => {
  const now = Date.now();
  const dt = drive.last ? now - drive.last : 0;
  drive.last = now;
  if (!drive.active) return;
  if (!drive.onBreak) {
    drive.drivingMs += dt;
    drive.sinceBreakMs += dt;
  }
  const breakEvery = profile.breakEveryMinutes * 60 * 1000;
  const ratio = drive.sinceBreakMs / breakEvery;
  if ($('t-total')) $('t-total').textContent = formatClock(drive.drivingMs);
  if ($('t-since')) $('t-since').textContent = formatClock(drive.sinceBreakMs);
  if ($('t-next')) $('t-next').textContent = formatClock(Math.max(0, breakEvery - drive.sinceBreakMs));
  setBar('t-progress', ratio, ratio >= 1 ? 'bad' : ratio > 0.8 ? 'warn' : '');
  if ($('t-break')) {
    $('t-break').textContent = drive.onBreak
      ? `on break ${formatClock(now - drive.breakStart)} / ${formatClock(profile.breakLengthMinutes * 60000)}`
      : 'driving';
  }
  if (ratio >= 1 && !drive.reminded) {
    drive.reminded = true;
    const msg = profile.breakRequired
      ? `You have driven 4 h 30 min without a break. Stop for at least ${profile.breakLengthMinutes} minutes.`
      : `You have been driving for ${profile.breakEveryMinutes / 60} hours. Take a ${profile.breakLengthMinutes}-minute break.`;
    $('break-box').textContent = msg;
    $('break-box').classList.remove('hidden');
    toast('Time for a break', msg, profile.breakRequired);
    if (user.watch_topic) api.alertWatch(msg).catch(() => {});
  }
}, 1000);

$('session-btn').addEventListener('click', async () => {
  alarm.unlock(); // allow sound later (browser rule)
  if (!drive.active) {
    engine.startSession();
    Object.assign(drive, { active: true, drivingMs: 0, sinceBreakMs: 0, reminded: false, last: Date.now() });
    $('session-btn').textContent = 'Stop driving and save';
    $('session-btn').className = 'btn danger';
    $('rec').classList.remove('hidden');
    return;
  }
  drive.active = false;
  drive.onBreak = false;
  engine.alarmsEnabled = true;
  renderDriverPanel();
  $('session-btn').textContent = 'Start driving';
  $('session-btn').className = 'btn primary';
  $('rec').classList.add('hidden');
  const summary = engine.stopSession();
  if (!summary) return;
  summary.driver_type = type;
  try {
    await api.saveSession(summary);
    toast(
      'Session saved',
      `${Math.round(summary.duration_seconds)} s, ${summary.alerts} alarms, ${summary.microsleeps} microsleeps`,
    );
  } catch (err) {
    toast('Could not save the session', err.message, true);
  }
});

// ---------- smartwatch panel ----------

function renderWatchStatus() {
  $('watch-ntfy').textContent = user.watch_topic ? 'on (' + user.watch_topic + ')' : 'not set up';
  $('watch-bt').textContent = bluetoothWatch.connected ? 'connected: ' + bluetoothWatch.name : 'not connected';
  $('bt-connect-btn').textContent = bluetoothWatch.connected ? 'Disconnect band' : 'Connect Bluetooth band';
  if (!bluetoothWatch.supported) {
    $('bt-connect-btn').disabled = true;
    $('watch-bt').textContent = 'not supported in this browser';
  }
}
bluetoothWatch.onChange = renderWatchStatus;
renderWatchStatus();

$('bt-connect-btn').addEventListener('click', async () => {
  if (bluetoothWatch.connected) {
    bluetoothWatch.disconnect();
    return;
  }
  try {
    const name = await bluetoothWatch.connect();
    toast('Band connected', name);
  } catch (err) {
    if (err.name !== 'NotFoundError') toast('Could not connect', err.message, true); // NotFoundError = user cancelled
  }
});

$('watch-test-btn').addEventListener('click', async () => {
  const res = await alertWatch(user, 'Test vibration from the Monitor page.');
  if (res.bluetooth) setTimeout(() => bluetoothWatch.stop(), 2000);
  const parts = [];
  if (bluetoothWatch.connected) parts.push('Bluetooth: ' + (res.bluetooth ? 'sent' : 'failed'));
  if (user.watch_topic) parts.push('Notification: ' + res.notification);
  toast('Test vibration', parts.join(', ') || 'No watch method is set up yet.');
});

// ---------- alarm: sound → vibration → watch → phone call ----------

let alarmTimers = [];
let alarmReason = '';

async function startAlarm(reason) {
  alarmReason = reason;
  $('alarm-reason').textContent = reason;
  $('alarm').classList.remove('hidden');
  $('a-call').textContent = 'not set up';

  // 1. sound (quiet and delayed when a passenger is on board)
  const quiet = drive.passenger;
  alarm.volume = quiet ? 0.08 : 0.3;
  let soundOk = false;
  if (!alarm.muted) {
    if (quiet) {
      $('a-sound').textContent = 'starts in 2 s (passenger mode)';
      alarmTimers.push(setTimeout(async () => ($('a-sound').textContent = (await alarm.play()) ? 'on (quiet)' : 'blocked by browser'), 2000));
      soundOk = true;
    } else {
      soundOk = await alarm.play();
      $('a-sound').textContent = soundOk ? 'on' : 'blocked by browser';
    }
  } else {
    $('a-sound').textContent = 'muted';
  }

  // spoken "Driver sleepy. Stop and hydrate." — repeated every 6 seconds
  if (!alarm.muted) {
    voice.speak(SLEEPY_MESSAGE);
    lastSpoken = now();
    alarmTimers.push(setInterval(() => voice.speak(SLEEPY_MESSAGE), 6000));
  }

  // 2. phone vibration
  const vibOk = phoneVibration.start();
  $('a-vibrate').textContent = vibOk ? 'on' : 'not available on this device';
  if (vibOk) alarmTimers.push(setInterval(() => phoneVibration.start(), 2500));

  // 3. smartwatch
  $('a-watch').textContent = 'sending…';
  const w = await alertWatch(user, `${SLEEPY_MESSAGE} ${reason}.`);
  if (bluetoothWatch.connected) alarmTimers.push(setInterval(() => bluetoothWatch.vibrate('high'), 5000));
  const watchParts = [];
  if (bluetoothWatch.connected) watchParts.push(w.bluetooth ? 'band vibrating' : 'band failed');
  if (user.watch_topic) watchParts.push('notification ' + w.notification);
  const watchOk = w.bluetooth || w.notification === 'sent';
  $('a-watch').textContent = watchParts.join(', ') || 'not set up';

  // 4. phone call if nobody presses "I'm awake"
  if (!alertSettings || !alertSettings.escalation_enabled || !alertSettings.phone_number) return;
  const anyOk = soundOk || vibOk || watchOk;
  let left = anyOk ? alertSettings.escalation_delay_seconds : Math.min(3, alertSettings.escalation_delay_seconds);
  const masked = alertSettings.phone_number.slice(0, 3) + '*****' + alertSettings.phone_number.slice(-3);
  $('a-call').textContent = `calling ${masked} in ${left} s`;
  const countdown = setInterval(async () => {
    left--;
    if (left > 0) {
      $('a-call').textContent = `calling ${masked} in ${left} s`;
      return;
    }
    clearInterval(countdown);
    $('a-call').textContent = 'calling…';
    try {
      const res = await api.escalate({
        reason: alarmReason,
        probability: lastState ? lastState.probability : 0,
        closure_seconds: lastState ? lastState.closure : 0,
      });
      $('a-call').textContent =
        res.status === 'calling' ? 'calling ' + masked
        : res.status === 'simulated' ? 'simulated (Twilio not set up)'
        : res.status === 'cooldown' ? 'already called a moment ago'
        : 'call failed';
    } catch (err) {
      $('a-call').textContent = 'call failed: ' + err.message;
    }
  }, 1000);
  alarmTimers.push(countdown);
}

function stopAlarm() {
  alarmTimers.forEach((t) => {
    clearTimeout(t);
    clearInterval(t);
  });
  alarmTimers = [];
  alarm.stop();
  voice.stop();
  phoneVibration.stop();
  bluetoothWatch.stop();
  $('alarm').classList.add('hidden');
}

$('awake-btn').addEventListener('click', () => engine.acknowledge());
