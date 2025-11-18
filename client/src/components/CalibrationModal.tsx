import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

interface CalibrationModalProps {
  isOpen: boolean;
  onComplete: () => void;
  duration?: number;
}

export function CalibrationModal({ isOpen, onComplete, duration = 3000 }: CalibrationModalProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      return;
    }

    const interval = 50;
    const increment = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 100);
          return 100;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [isOpen, duration, onComplete]);

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md" data-testid="calibration-modal">
        <DialogHeader>
          <DialogTitle className="text-2xl">Calibration</DialogTitle>
          <DialogDescription className="text-base pt-2">
            Look directly at the camera and keep your eyes open normally.
            This will help establish your baseline measurements.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Progress value={progress} className="h-2" data-testid="progress-calibration" />
          <p className="text-center text-sm text-muted-foreground">
            {Math.round(progress)}% complete
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
