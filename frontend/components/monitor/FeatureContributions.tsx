import type { FeatureVector } from '@/types';
import { FEATURE_SPEC } from '@/types';

const SHORT: Record<string, string> = {
  ear_mean: 'EAR mean',
  ear_std: 'EAR std',
  perclos: 'PERCLOS',
  blink_rate: 'Blink rate',
  blink_duration_mean: 'Blink duration',
  longest_closure: 'Longest closure',
  mar_mean: 'MAR mean',
  yawn_rate: 'Yawn rate',
  pitch_mean: 'Head pitch',
  pitch_std: 'Pitch std',
  yaw_std: 'Yaw std',
};

function fmt(name: string, v: number) {
  if (name === 'perclos') return `${(v * 100).toFixed(0)}%`;
  if (name.includes('rate')) return v.toFixed(1);
  if (name.includes('pitch') || name.includes('yaw')) return `${v.toFixed(1)}°`;
  if (name.includes('duration') || name.includes('closure')) return `${v.toFixed(2)}s`;
  return v.toFixed(3);
}

/**
 * Explainability panel: occlusion-based contribution of each feature to the current
 * prediction (probability − probability with that feature replaced by its training mean).
 */
export function FeatureContributions({
  features,
  contributions,
}: {
  features: FeatureVector | null;
  contributions: Record<string, number> | null;
}) {
  if (!features || !contributions) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Waiting for the first feature window…</p>;
  }
  const max = Math.max(0.05, ...Object.values(contributions).map(Math.abs));
  const rows = FEATURE_SPEC.features
    .map((f) => ({ name: f.name, description: f.description, c: contributions[f.name] ?? 0 }))
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c));

  return (
    <div className="space-y-1.5">
      {rows.map(({ name, description, c }) => (
        <div key={name} className="grid grid-cols-[110px_1fr_64px] items-center gap-2 text-xs" title={description}>
          <span className="truncate text-muted-foreground">{SHORT[name] ?? name}</span>
          <div className="relative h-4">
            <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
            <div
              className={c >= 0 ? 'absolute left-1/2 h-full rounded-r bg-red-400/70' : 'absolute right-1/2 h-full rounded-l bg-cyan-400/70'}
              style={{ width: `${(Math.abs(c) / max) * 50}%`, transition: 'width 200ms' }}
            />
          </div>
          <span className="text-right font-mono tabular text-foreground">
            {fmt(name, (features as Record<string, number>)[name])}
          </span>
        </div>
      ))}
      <div className="flex justify-between pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="text-cyan-300">← towards alert</span>
        <span className="text-red-300">towards drowsy →</span>
      </div>
    </div>
  );
}
