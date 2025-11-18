import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AlertOverlayProps {
  onSnooze: () => void;
}

export function AlertOverlay({ onSnooze }: AlertOverlayProps) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-destructive/90 animate-flash-alert"
      data-testid="alert-overlay"
    >
      <div className="text-center space-y-6 p-8">
        <AlertTriangle className="h-24 w-24 text-destructive-foreground mx-auto animate-pulse" />
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-bold text-destructive-foreground" data-testid="text-alert-title">
            DROWSINESS DETECTED
          </h1>
          <p className="text-xl md:text-2xl text-destructive-foreground/90" data-testid="text-alert-subtitle">
            PLEASE PULL OVER SAFELY
          </p>
        </div>
        <Button
          size="lg"
          variant="outline"
          onClick={onSnooze}
          className="bg-background hover:bg-background/90 text-foreground border-2"
          data-testid="button-snooze"
        >
          Acknowledge Alert
        </Button>
      </div>
    </div>
  );
}
