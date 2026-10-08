import type { LabeledSample, SessionSummary } from '@/types';
import { FEATURE_NAMES } from '@/types';

const SESSIONS_KEY = 'drowsiguard.sessions';
const SAMPLES_KEY = 'drowsiguard.samples';
const MAX_SESSIONS = 50;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or storage blocked */
  }
}

export const sessionStore = {
  list: (): SessionSummary[] => read<SessionSummary[]>(SESSIONS_KEY, []),
  save(session: SessionSummary) {
    const all = [session, ...this.list().filter((s) => s.id !== session.id)].slice(0, MAX_SESSIONS);
    write(SESSIONS_KEY, all);
  },
  clear: () => write(SESSIONS_KEY, []),
};

export const sampleStore = {
  list: (): LabeledSample[] => read<LabeledSample[]>(SAMPLES_KEY, []),
  save: (samples: LabeledSample[]) => write(SAMPLES_KEY, samples),
  clear: () => write(SAMPLES_KEY, []),
};

/** CSV in the column layout expected by ml/preprocessing/build_dataset.py */
export function samplesToCsv(samples: LabeledSample[]): string {
  const header = ['timestamp_ms', ...FEATURE_NAMES, 'label'].join(',');
  const rows = samples.map((s) =>
    [
      Math.round(s.t),
      ...FEATURE_NAMES.map((f) => (s.features as Record<string, number>)[f].toFixed(6)),
      s.label,
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function downloadFile(filename: string, content: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
