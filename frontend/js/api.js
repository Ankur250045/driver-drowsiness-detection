// api.js — talks to the FastAPI backend (same server that serves these pages).

const TOKEN_KEY = 'dd.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Turn FastAPI error responses into one readable sentence.
function errorMessage(body, fallback) {
  if (!body || body.detail === undefined) return fallback;
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail
      .map((e) => {
        const field = e.loc ? e.loc[e.loc.length - 1] : '';
        const msg = (e.msg || 'invalid').replace(/^Value error, /, '');
        return typeof field === 'string' ? field + ': ' + msg : msg;
      })
      .join('; ');
  }
  return JSON.stringify(body.detail);
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', 'Bearer ' + token);

  const res = await fetch('/api' + path, { ...options, headers });
  if (res.status === 401 && token) {
    // token expired → back to login
    setToken(null);
    window.location.href = 'login.html';
    throw new Error('Session expired, please sign in again');
  }
  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      // not JSON
    }
    throw new Error(errorMessage(body, res.status + ' ' + res.statusText));
  }
  return res.status === 204 ? null : res.json();
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  health: () => request('/health'),

  register: (email, password, fullName) =>
    request('/auth/register', json('POST', { email, password, full_name: fullName || null })),

  async login(email, password) {
    const res = await request('/auth/login', {
      method: 'POST',
      body: new URLSearchParams({ username: email, password }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    setToken(res.access_token);
    return res;
  },

  me: () => request('/users/me'),
  saveProfile: (profile) => request('/users/me/profile', json('PUT', profile)),

  sessions: () => request('/sessions'),
  session: (id) => request('/sessions/' + id),
  saveSession: (s) => request('/sessions', json('POST', s)),
  summary: () => request('/analytics/summary'),

  alertSettings: () => request('/alerts/settings'),
  saveAlertSettings: (s) => request('/alerts/settings', json('PUT', s)),
  escalate: (payload) => request('/alerts/escalate', json('POST', payload)),

  setWatchTopic: (topic) => request('/alerts/watch', json('PUT', { watch_topic: topic || null })),
  alertWatch: (reason, test = false) => request('/alerts/watch', json('POST', { reason, test })),

  uploadSamples: (samples) =>
    request(
      '/datasets/samples',
      json('POST', { samples: samples.map((s) => ({ timestamp_ms: s.t, label: s.label, features: s.features })) }),
    ),

  insights: () => request('/insights'),
  runInsights: () => request('/insights/run', { method: 'POST' }),
};

// Every page except login calls this first. Returns the signed-in user, or
// redirects to the login page (or to the profile page if no driver type yet).
export async function requireUser({ needProfile = true } = {}) {
  if (!getToken()) {
    window.location.href = 'login.html';
    return new Promise(() => {}); // stop the page script
  }
  const user = await api.me();
  if (needProfile && !user.driver_type) {
    window.location.href = 'profile.html';
    return new Promise(() => {});
  }
  return user;
}

export function logout() {
  setToken(null);
  window.location.href = 'login.html';
}
