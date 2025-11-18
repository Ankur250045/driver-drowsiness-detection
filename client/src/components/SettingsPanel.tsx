import { DetectionSettings } from '@shared/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Settings, Volume2, VolumeX } from 'lucide-react';

interface SettingsPanelProps {
  settings: DetectionSettings;
  onSettingsChange: (settings: DetectionSettings) => void;
  onCalibrate: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onReset: () => void;
}

export function SettingsPanel({
  settings,
  onSettingsChange,
  onCalibrate,
  isMuted,
  onToggleMute,
  onReset,
}: SettingsPanelProps) {
  return (
    <Card data-testid="settings-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Detection Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">EAR Threshold</Label>
            <span className="text-sm font-mono text-muted-foreground" data-testid="value-ear-threshold">
              {settings.earThreshold.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[settings.earThreshold]}
            onValueChange={(value) =>
              onSettingsChange({ ...settings, earThreshold: value[0] })
            }
            min={0.1}
            max={0.5}
            step={0.01}
            data-testid="slider-ear-threshold"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">EAR Consecutive Frames</Label>
            <span className="text-sm font-mono text-muted-foreground" data-testid="value-ear-frames">
              {settings.earConsecFrames}
            </span>
          </div>
          <Slider
            value={[settings.earConsecFrames]}
            onValueChange={(value) =>
              onSettingsChange({ ...settings, earConsecFrames: value[0] })
            }
            min={5}
            max={60}
            step={1}
            data-testid="slider-ear-frames"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">MAR Threshold</Label>
            <span className="text-sm font-mono text-muted-foreground" data-testid="value-mar-threshold">
              {settings.marThreshold.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[settings.marThreshold]}
            onValueChange={(value) =>
              onSettingsChange({ ...settings, marThreshold: value[0] })
            }
            min={0.3}
            max={1.0}
            step={0.01}
            data-testid="slider-mar-threshold"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">MAR Consecutive Frames</Label>
            <span className="text-sm font-mono text-muted-foreground" data-testid="value-mar-frames">
              {settings.marConsecFrames}
            </span>
          </div>
          <Slider
            value={[settings.marConsecFrames]}
            onValueChange={(value) =>
              onSettingsChange({ ...settings, marConsecFrames: value[0] })
            }
            min={5}
            max={60}
            step={1}
            data-testid="slider-mar-frames"
          />
        </div>

        <div className="pt-4 border-t space-y-2">
          <Button 
            onClick={onCalibrate} 
            className="w-full" 
            variant="default"
            data-testid="button-calibrate"
          >
            Calibrate
          </Button>
          <div className="flex gap-2">
            <Button
              onClick={onToggleMute}
              variant="outline"
              className="flex-1"
              data-testid="button-mute"
            >
              {isMuted ? <VolumeX className="h-4 w-4 mr-2" /> : <Volume2 className="h-4 w-4 mr-2" />}
              {isMuted ? 'Unmute' : 'Mute'}
            </Button>
            <Button
              onClick={onReset}
              variant="outline"
              className="flex-1"
              data-testid="button-reset"
            >
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
