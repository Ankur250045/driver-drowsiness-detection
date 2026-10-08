import { Crosshair, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { DetectionSettings } from '@/types';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface ControlPanelProps {
  settings: DetectionSettings;
  onChange: (s: DetectionSettings) => void;
  onCalibrate: () => void;
  onReset: () => void;
  muted: boolean;
  onToggleMute: () => void;
  calibrating: boolean;
}

const SLIDERS: {
  key: keyof DetectionSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  hint: string;
}[] = [
  { key: 'earThreshold', label: 'Eye-closed EAR threshold', min: 0.1, max: 0.35, step: 0.005, fmt: (v) => v.toFixed(3), hint: 'Set automatically by calibration' },
  { key: 'marThreshold', label: 'Yawn MAR threshold', min: 0.3, max: 1, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'Mouth-open ratio for yawn detection' },
  { key: 'microsleepSeconds', label: 'Microsleep duration', min: 0.5, max: 3, step: 0.1, fmt: (v) => `${v.toFixed(1)} s`, hint: 'Continuous closure that triggers the alarm' },
  { key: 'drowsyProbability', label: 'Drowsy decision threshold', min: 0.2, max: 0.9, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'Classifier probability → "Drowsy"' },
  { key: 'criticalProbability', label: 'Critical decision threshold', min: 0.5, max: 0.99, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'Classifier probability → alarm' },
];

export function ControlPanel({ settings, onChange, onCalibrate, onReset, muted, onToggleMute, calibrating }: ControlPanelProps) {
  return (
    <div className="space-y-5" data-testid="settings-panel">
      {SLIDERS.map((s) => (
        <div key={s.key} className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{s.label}</Label>
            <span className="font-mono text-xs text-primary">{s.fmt(settings[s.key])}</span>
          </div>
          <Slider
            value={[settings[s.key]]}
            min={s.min}
            max={s.max}
            step={s.step}
            onValueChange={([v]) => onChange({ ...settings, [s.key]: v })}
          />
          <p className="text-[11px] text-muted-foreground">{s.hint}</p>
        </div>
      ))}
      <div className="grid grid-cols-3 gap-2 border-t border-border pt-4">
        <Button size="sm" onClick={onCalibrate} disabled={calibrating} data-testid="button-calibrate">
          <Crosshair className="mr-1.5 h-3.5 w-3.5" /> Calibrate
        </Button>
        <Button size="sm" variant="outline" onClick={onToggleMute} data-testid="button-mute">
          {muted ? <VolumeX className="mr-1.5 h-3.5 w-3.5" /> : <Volume2 className="mr-1.5 h-3.5 w-3.5" />}
          {muted ? 'Unmute' : 'Mute'}
        </Button>
        <Button size="sm" variant="outline" onClick={onReset} data-testid="button-reset">
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
        </Button>
      </div>
    </div>
  );
}
