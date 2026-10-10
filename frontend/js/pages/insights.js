import { api, requireUser } from '../api.js';
import { $, escapeHtml, renderHeader, toast } from '../common.js';

const user = await requireUser();
renderHeader(user);

const PLOTS = [
  ['risk_by_hour.png', 'Drowsiness by hour of the day'],
  ['risk_by_driver_type.png', 'Drowsiness by driver type'],
  ['events_by_type.png', 'What kind of events happen'],
  ['duration_vs_risk.png', 'Longer drives vs. drowsiness'],
  ['perclos_distribution.png', 'PERCLOS per session'],
  ['daily_trend.png', 'Trend over days'],
];

function show(data) {
  $('no-r').classList.toggle('hidden', data.r_installed);
  if (!data.r_installed) {
    $('no-r').innerHTML =
      'R is not installed on the server computer, so the analysis can\'t be run from here. Install R from ' +
      '<a href="https://cran.r-project.org" target="_blank" rel="noreferrer">cran.r-project.org</a>, then run ' +
      '<code>Rscript r/install_packages.R</code> once.';
  }
  $('run-btn').disabled = !data.r_installed;
  if (!data.available) {
    $('results').classList.add('hidden');
    $('generated').textContent = 'The R analysis has not been run yet.';
    return;
  }
  $('results').classList.remove('hidden');
  $('generated').textContent = `Generated ${new Date(data.generated_at).toLocaleString()} from ${data.n_sessions} sessions by ${data.n_drivers} drivers (R ${data.r_version}).`;
  $('demo-note').classList.toggle('hidden', !data.demo_data);
  if (data.demo_data) {
    $('demo-note').textContent =
      'Fewer than 10 real sessions were found, so the R script used randomly generated example sessions to show what the analysis looks like. Record more sessions for real results.';
  }

  $('kpis').innerHTML = [
    ['Sessions', data.n_sessions],
    ['Hours monitored', data.total_hours.toFixed(1)],
    ['Mean drowsiness probability', (data.mean_probability * 100).toFixed(1) + ' %'],
    ['Microsleeps per hour', data.microsleeps_per_hour.toFixed(2)],
  ]
    .map(([k, v]) => `<div class="stat"><div class="label">${k}</div><div class="value">${v}</div></div>`)
    .join('');

  $('findings').innerHTML = data.findings.map((f) => `<li>${escapeHtml(f)}</li>`).join('');

  $('tests').innerHTML = data.tests
    .map(
      (t) => `<tr>
        <td>${escapeHtml(t.question)}</td>
        <td>${escapeHtml(t.test)}</td>
        <td class="num">${t.statistic === null ? '–' : Number(t.statistic).toFixed(3)}</td>
        <td class="num">${t.p_value === null ? '–' : Number(t.p_value) < 0.001 ? '< 0.001' : Number(t.p_value).toFixed(3)}</td>
        <td>${escapeHtml(t.conclusion)}</td>
      </tr>`,
    )
    .join('');

  const stamp = Date.parse(data.generated_at) || Date.now();
  $('plots').innerHTML = PLOTS.map(
    ([file, title]) => `<section class="panel">
      <div class="panel-head"><h2>${title}</h2></div>
      <div class="panel-body"><img class="insight-img" src="insights/${file}?v=${stamp}" alt="${title}" onerror="this.parentElement.innerHTML='<p class=muted>Not enough data for this chart.</p>'" /></div>
    </section>`,
  ).join('');

  $('by-type').innerHTML = data.by_driver_type
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.driver_type)}</td>
        <td class="num">${r.sessions}</td>
        <td class="num">${r.hours.toFixed(1)}</td>
        <td class="num">${(r.mean_probability * 100).toFixed(1)} %</td>
        <td class="num">${r.microsleeps_per_hour.toFixed(2)}</td>
        <td class="num">${r.alarms_per_hour.toFixed(2)}</td>
      </tr>`,
    )
    .join('');
}

show(await api.insights());

$('run-btn').addEventListener('click', async () => {
  const btn = $('run-btn');
  btn.disabled = true;
  btn.textContent = 'Running R…';
  try {
    show(await api.runInsights());
    toast('R analysis finished');
  } catch (err) {
    toast('R analysis failed', err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run R analysis again';
  }
});
