// common.js — page header, toasts and small helpers shared by all pages.

import { logout } from './api.js';
import { DRIVER_TYPES } from './drivers.js';

const PAGES = [
  ['monitor.html', 'Monitor'],
  ['sessions.html', 'Sessions'],
  ['insights.html', 'Insights'],
  ['training.html', 'Training'],
  ['profile.html', 'Profile'],
];

export function renderHeader(user) {
  const header = document.getElementById('site-header');
  if (!header) return;
  const current = location.pathname.split('/').pop() || 'monitor.html';
  const type = user.driver_type ? DRIVER_TYPES[user.driver_type] : null;
  // colour scheme follows the driver type (see "Colour theme" in style.css)
  document.body.classList.remove('driver-personal', 'driver-cab', 'driver-truck');
  if (user.driver_type) document.body.classList.add('driver-' + user.driver_type);
  header.className = 'site-header';
  header.innerHTML = `
    <div class="inner">
      <a href="monitor.html" class="site-title">Driver Drowsiness Detection</a>
      <nav class="site-nav">
        ${PAGES.map(([href, label]) => `<a href="${href}" class="${href === current ? 'active' : ''}">${label}</a>`).join('')}
      </nav>
      <div class="header-right">
        <span>${escapeHtml(user.full_name || user.email)}${type ? ` <span class="badge">${type.short}</span>` : ''}</span>
        <button class="btn small" id="logout-btn">Log out</button>
      </div>
    </div>`;
  document.getElementById('logout-btn').addEventListener('click', logout);
}

export function toast(title, description = '', isError = false) {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = isError ? 'toast error' : 'toast';
  el.innerHTML = `<b>${escapeHtml(title)}</b>${escapeHtml(description)}`;
  box.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function $(id) {
  return document.getElementById(id);
}

export function formatClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  return m ? `${m} min ${Math.round(seconds % 60)} s` : `${Math.round(seconds)} s`;
}

export function downloadFile(filename, content, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
