import { Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DebugToggleProps {
  showDebug: boolean;
  onToggle: () => void;
}

export function DebugToggle({ showDebug, onToggle }: DebugToggleProps) {
  return (
    <div className="fixed bottom-4 right-4 z-40">
      <Button
        size="icon"
        variant={showDebug ? 'default' : 'outline'}
        onClick={onToggle}
        className="rounded-full shadow-lg"
        data-testid="button-debug-toggle"
      >
        <Bug className="h-4 w-4" />
      </Button>
    </div>
  );
}
