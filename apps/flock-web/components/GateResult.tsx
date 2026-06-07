import { cn } from '@/lib/utils';

interface GateResultProps {
  gate: string;
  status: 'passed' | 'failed' | 'skipped';
  summary?: string;
  duration?: number;
  className?: string;
}

export function GateResult({ gate, status, summary, duration, className }: GateResultProps) {
  const icons: Record<string, string> = {
    passed: '✅',
    failed: '❌',
    skipped: '⏭️',
  };

  const colors: Record<string, string> = {
    passed: 'text-green-400',
    failed: 'text-red-400',
    skipped: 'text-gray-400',
  };

  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <span className={colors[status]}>{icons[status]}</span>
      <span className="font-medium">{gate}</span>
      {summary && <span className="text-muted-foreground">— {summary}</span>}
      {duration !== undefined && (
        <span className="text-muted-foreground">({duration}ms)</span>
      )}
    </div>
  );
}
