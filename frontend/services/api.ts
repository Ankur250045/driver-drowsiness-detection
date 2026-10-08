import type { FeatureVector, LabeledSample, SessionSummary } from '@/types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const TOKEN_KEY = 'drowsiguard.token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface HealthResponse {
  status: string;
  model: { name: string; version: string; trained: boolean };
}

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  created_at: string;
}

export interface PredictResponse {
  probability: number;
  label: 'alert' | 'drowsy';
  model_version: string;
}

export interface AnalyticsSummary {
  total_sessions: number;
  total_drive_minutes: number;
  avg_probability: number;
  total_microsleeps: number;
  total_alerts: number;
  total_yawns: number;
  risk_by_hour: { hour: number; avg_probability: number; sessions: number }[];
}

export interface AlertSettings {
  phone_number: string | null;
  emergency_contact: string | null;
  escalation_enabled: boolean;
  escalation_delay_seconds: number;
  /** False → Twilio credentials missing on the server; calls are simulated. */
  provider_configured: boolean;
}

export interface EscalationResult {
  status: 'calling' | 'simulated' | 'failed' | 'cooldown';
  call_sid: string | null;
  sms_sid: string | null;
  message: string;
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  register: (email: string, password: string, fullName?: string) =>
    request<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name: fullName || null }),
    }),

  login: async (email: string, password: string) => {
    const form = new URLSearchParams({ username: email, password });
    const res = await request<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: form,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    setToken(res.access_token);
    return res;
  },

  logout: () => setToken(null),

  me: () => request<User>('/users/me'),

  predict: (features: FeatureVector) =>
    request<PredictResponse>('/predict', { method: 'POST', body: JSON.stringify({ features }) }),

  modelInfo: () => request<Record<string, unknown>>('/predict/model'),

  saveSession: (s: SessionSummary) =>
    request<{ id: number }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        client_id: s.id,
        started_at: s.startedAt,
        duration_seconds: s.durationSeconds,
        model_version: s.modelVersion,
        avg_probability: s.avgProbability,
        max_probability: s.maxProbability,
        avg_perclos: s.avgPerclos,
        total_blinks: s.totalBlinks,
        total_yawns: s.totalYawns,
        microsleeps: s.microsleeps,
        alerts: s.alerts,
        events: s.events,
        timeline: s.timeline,
      }),
    }),

  analyticsSummary: () => request<AnalyticsSummary>('/analytics/summary'),

  alertSettings: () => request<AlertSettings>('/alerts/settings'),

  updateAlertSettings: (s: Omit<AlertSettings, 'provider_configured'>) =>
    request<AlertSettings>('/alerts/settings', { method: 'PUT', body: JSON.stringify(s) }),

  escalate: (payload: { reason: string; probability: number; closure_seconds: number; test?: boolean }) =>
    request<EscalationResult>('/alerts/escalate', { method: 'POST', body: JSON.stringify(payload) }),

  uploadSamples: (samples: LabeledSample[]) =>
    request<{ stored: number }>('/datasets/samples', {
      method: 'POST',
      body: JSON.stringify({
        samples: samples.map((s) => ({ timestamp_ms: s.t, label: s.label, features: s.features })),
      }),
    }),
};
