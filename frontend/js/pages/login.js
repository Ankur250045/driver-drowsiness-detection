import { api, getToken } from '../api.js';
import { $ } from '../common.js';

let mode = 'login';

// already signed in? go straight on
if (getToken()) {
  api
    .me()
    .then((u) => (window.location.href = u.driver_type ? 'monitor.html' : 'profile.html'))
    .catch(() => {});
}

function setMode(m) {
  mode = m;
  $('tab-login').classList.toggle('active', m === 'login');
  $('tab-register').classList.toggle('active', m === 'register');
  $('name-field').classList.toggle('hidden', m === 'login');
  $('password-help').classList.toggle('hidden', m === 'login');
  $('password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('submit-btn').textContent = m === 'login' ? 'Sign in' : 'Create account';
  $('error').classList.add('hidden');
}

$('tab-login').addEventListener('click', () => setMode('login'));
$('tab-register').addEventListener('click', () => setMode('register'));

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim();
  const password = $('password').value;
  const btn = $('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Please wait…';
  try {
    if (mode === 'register') await api.register(email, password, $('name').value.trim());
    await api.login(email, password);
    const user = await api.me();
    // new users first choose what kind of driver they are
    window.location.href = user.driver_type ? 'monitor.html' : 'profile.html';
  } catch (err) {
    $('error').textContent = err.message;
    $('error').classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
  }
});
