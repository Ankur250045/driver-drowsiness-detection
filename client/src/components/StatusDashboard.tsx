import { DetectionStatus } from '@shared/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, Moon, Activity } from 'lucide-react';

interface StatusDashboardProps {
  status: DetectionStatus;
  ear: number;
  mar: number;
  fps: number;
  showDebug: boolean;
}

export function StatusDashboard({ status, ear, mar, fps, showDebug }: StatusDashboardProps) {
  const getStatusText = () => {
    switch (status) {
      case 'alert':
        return 'Alert';
      case 'drowsy':
        return 'Drowsy - Be Careful';
      case 'critical':
        return 'Critical - Please Stop';
      default:
        return 'Alert';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'alert':
        return 'text-primary';
      case 'drowsy':
        return 'text-yellow-500';
      case 'critical':
        return 'text-destructive';
      default:
        return 'text-primary';
    }
  };

  const getStatusBgColor = () => {
    switch (status) {
      case 'alert':
        return 'bg-primary/10';
      case 'drowsy':
        return 'bg-yellow-500/10';
      case 'critical':
        return 'bg-destructive/10';
      default:
        return 'bg-primary/10';
    }
  };

  return (
    <Card className="h-full" data-testid="status-dashboard">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Driver Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className={`p-6 rounded-md ${getStatusBgColor()} transition-all duration-300 animate-slide-up`}>
          <div className={`text-3xl font-bold ${getStatusColor()}`} data-testid="text-status">
            {getStatusText()}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3" data-testid="metric-ear">
            <div className="p-2 rounded-md bg-card">
              <Eye className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="text-sm text-muted-foreground">Eye Aspect Ratio</div>
              <div className="text-xl font-mono font-semibold" data-testid="value-ear">
                {ear.toFixed(3)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3" data-testid="metric-mar">
            <div className="p-2 rounded-md bg-card">
              <Moon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="text-sm text-muted-foreground">Mouth Aspect Ratio</div>
              <div className="text-xl font-mono font-semibold" data-testid="value-mar">
                {mar.toFixed(3)}
              </div>
            </div>
          </div>

          {showDebug && (
            <div className="flex items-center gap-3 pt-2 border-t" data-testid="metric-fps">
              <div className="p-2 rounded-md bg-card">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">Frame Rate</div>
                <div className="text-xl font-mono font-semibold" data-testid="value-fps">
                  {fps.toFixed(1)} FPS
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
