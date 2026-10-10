import { api, requireUser } from '../api.js';
import { $, renderHeader, toast } from '../common.js';
import { DRIVER_TYPES } from '../drivers.js';
import { newTopic } from '../watch.js';

const PHONE_RE = /^\+[1-9]\d{7,14}$/;

let user = await requireUser({ needProfile: false });
renderHeader(user);
const firstTime = !user.driver_type;
if (firstTime) $('intro').textContent = 'Welcome! First choose what kind of driver you are. You can change this later.';

// ---------- 1. driver type ----------

function highlightCards() {
  document.querySelectorAll('.type-card').forEach((card) => {
    card.classList.toggle('selected', card.querySelector('input').checked);
  });
  const type = document.querySelector('input[name=driver_type]:checked')?.value;
  if (type) $('contact-label').textContent = `${DRIVER_TYPES[type].contactLabel} (gets an SMS)`;
}

document.querySelectorAll('input[name=driver_type]').forEach((input) => {
  input.checked = input.value === user.driver_type;
  input.addEventListener('change', highlightCards);
});
$('full_name').value = user.full_name || '';
$('vehicle_number').value = user.vehicle_number || '';
highlightCards();

$('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.querySelector('input[name=driver_type]:checked')?.value;
  try {
    user = await api.saveProfile({
      driver_type: type,
      full_name: $('full_name').value,
      vehicle_number: $('vehicle_number').value,
    });
    renderHeader(user);
    toast('Profile saved', DRIVER_TYPES[type].label);
    if (firstTime) window.location.href = 'monitor.html';
  } catch (err) {
    toast('Could not save', err.message, true);
  }
});

// ---------- 2. smartwatch (ntfy topic) ----------

function showTopic() {
  $('topic').textContent = user.watch_topic || '(not set up)';
  $('test-watch-btn').disabled = !user.watch_topic;
  $('remove-topic-btn').disabled = !user.watch_topic;
}
showTopic();

$('new-topic-btn').addEventListener('click', async () => {
  if (user.watch_topic && !confirm('Create a new topic? You will have to subscribe to it again in the ntfy app.')) return;
  try {
    user = await api.setWatchTopic(newTopic());
    showTopic();
    toast('Topic created', 'Now subscribe to it in the ntfy app.');
  } catch (err) {
    toast('Error', err.message, true);
  }
});

$('remove-topic-btn').addEventListener('click', async () => {
  user = await api.setWatchTopic(null);
  showTopic();
});

$('test-watch-btn').addEventListener('click', async () => {
  try {
    const res = await api.alertWatch('This is a test from Driver Drowsiness Detection.', true);
    toast(res.status === 'sent' ? 'Test sent' : 'Not sent', res.message, res.status !== 'sent');
  } catch (err) {
    toast('Error', err.message, true);
  }
});

// ---------- 3. phone call ----------

let alertSettings = await api.alertSettings();
$('esc-enabled').checked = alertSettings.escalation_enabled;
$('phone').value = alertSettings.phone_number || '';
$('contact').value = alertSettings.emergency_contact || '';
$('delay').value = alertSettings.escalation_delay_seconds;
$('delay-value').textContent = alertSettings.escalation_delay_seconds + ' s';
$('twilio-note').classList.toggle('hidden', alertSettings.provider_configured);
$('test-call-btn').disabled = !alertSettings.phone_number;

$('delay').addEventListener('input', () => ($('delay-value').textContent = $('delay').value + ' s'));

$('save-call-btn').addEventListener('click', async () => {
  const phone = $('phone').value.trim();
  const contact = $('contact').value.trim();
  const phoneOk = !phone || PHONE_RE.test(phone);
  const contactOk = !contact || PHONE_RE.test(contact);
  $('phone-error').classList.toggle('hidden', phoneOk);
  $('contact-error').classList.toggle('hidden', contactOk);
  if (!phoneOk || !contactOk) return;
  if ($('esc-enabled').checked && !phone) {
    toast('Mobile number needed', 'Enter your number to turn on the phone call.', true);
    return;
  }
  try {
    alertSettings = await api.saveAlertSettings({
      phone_number: phone || null,
      emergency_contact: contact || null,
      escalation_enabled: $('esc-enabled').checked,
      escalation_delay_seconds: Number($('delay').value),
    });
    $('test-call-btn').disabled = !alertSettings.phone_number;
    toast('Saved');
  } catch (err) {
    toast('Could not save', err.message, true);
  }
});

$('test-call-btn').addEventListener('click', async () => {
  try {
    const res = await api.escalate({ reason: 'This is a test call', probability: 0, closure_seconds: 0, test: true });
    toast('Test call: ' + res.status, res.message);
  } catch (err) {
    toast('Test call failed', err.message, true);
  }
});
