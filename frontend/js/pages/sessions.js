import { api, requireUser } from '../api.js';
import { $, escapeHtml, formatClock, formatDuration, renderHeader } from '../common.js';
import { DRIVER_TYPES } from '../drivers.js';

const user = await requireUser();
renderHeader(user);

const sessions = await api.sessions();

if (!sessions.length) {
  $('empty').classList.remove('hidden');
} else {
  $('content').classList.remove('hidden');
  showTotals();
  showPerSessionChart();
  showTable();
  showDetail(sessions[0].id);
}

function showTotals() {
  const totalSeconds = sessions.reduce((a, s) => a + s.duration_seconds, 0);
  const weighted = totalSeconds ? sessions.reduce((a, s) => a + s.avg_probability * s.duration_seconds, 0) / totalSeconds : 0;
  $('s-count').textContent = sessions.length;
  $('s-time').innerHTML = (totalSeconds / 60).toFixed(1) + ' <span class="small muted">min</span>';
  $('s-avg').innerHTML = (weighted * 100).toFixed(1) + ' <span class="small muted">%</span>';
  $('s-micro').textContent = sessions.reduce((a, s) => a + s.microsleeps, 0);
  $('s-alarms').textContent = sessions.reduce((a, s) => a + s.alerts, 0);
  $('s-yawns').textContent = sessions.reduce((a, s) => a + s.total_yawns, 0);
}

function showPerSessionChart() {
  const ordered = sessions.slice().reverse();
  new Chart($('per-session'), {
    type: 'bar',
    data: {
      labels: ordered.map((_, i) => '#' + (i + 1)),
      datasets: [
        { label: 'average', data: ordered.map((s) => s.avg_probability), backgroundColor: '#1a5aa6' },
        { label: 'peak', data: ordered.map((s) => s.max_probability), backgroundColor: '#9bb7dc' },
      ],
    },
    options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 1 } } },
  });
}

function showTable() {
  $('session-rows').innerHTML = sessions
    .map(
      (s) => `<tr class="selectable" data-id="${s.id}">
        <td>${new Date(s.started_at).toLocaleString()}</td>
        <td class="num">${formatDuration(s.duration_seconds)}</td>
        <td class="num">${s.alerts}</td>
      </tr>`,
    )
    .join('');
  document.querySelectorAll('#session-rows tr').forEach((row) => {
    row.addEventListener('click', () => showDetail(Number(row.dataset.id)));
  });
}

let detailChart = null;

async function showDetail(id) {
  document.querySelectorAll('#session-rows tr').forEach((r) => r.classList.toggle('selected', Number(r.dataset.id) === id));
  const s = await api.session(id);
  const type = s.driver_type ? DRIVER_TYPES[s.driver_type].label : '–';
  $('detail-title').textContent = 'Session of ' + new Date(s.started_at).toLocaleString();
  $('detail').innerHTML = `
    <table class="kv" style="margin-bottom:12px"><tbody>
      <tr><td>Driver type</td><td>${type}</td></tr>
      <tr><td>Duration</td><td>${formatDuration(s.duration_seconds)}</td></tr>
      <tr><td>Average / peak probability</td><td>${(s.avg_probability * 100).toFixed(0)}% / ${(s.max_probability * 100).toFixed(0)}%</td></tr>
      <tr><td>Average PERCLOS</td><td>${(s.avg_perclos * 100).toFixed(1)}%</td></tr>
      <tr><td>Blinks / yawns / microsleeps</td><td>${s.total_blinks} / ${s.total_yawns} / ${s.microsleeps}</td></tr>
      <tr><td>Model</td><td>${escapeHtml(s.model_version)}</td></tr>
    </tbody></table>
    <div class="chart-box"><canvas id="detail-chart"></canvas></div>
    <h3 style="margin-top:14px">Events</h3>
    <ul class="events">${
      s.events.length
        ? s.events
            .map((e) => `<li><span class="type">${escapeHtml(e.type)}</span><span>${escapeHtml(e.detail)}</span><span class="time">${formatClock(e.t)}</span></li>`)
            .join('')
        : '<li class="muted">No events.</li>'
    }</ul>`;
  if (detailChart) detailChart.destroy();
  detailChart = new Chart($('detail-chart'), {
    type: 'line',
    data: {
      datasets: [
        { label: 'probability', data: s.timeline.map((p) => ({ x: p.t, y: p.probability })), borderColor: '#1a5aa6', pointRadius: 0, borderWidth: 2 },
        { label: 'PERCLOS', data: s.timeline.map((p) => ({ x: p.t, y: p.perclos })), borderColor: '#555555', pointRadius: 0, borderWidth: 1.5 },
      ],
    },
    options: {
      animation: false,
      maintainAspectRatio: false,
      scales: { x: { type: 'linear', ticks: { callback: (v) => Math.round(v) + 's' } }, y: { min: 0, max: 1 } },
    },
  });
}
