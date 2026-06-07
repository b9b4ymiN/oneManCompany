import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const TASK_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  READY: 'bg-blue-500/20 text-blue-400',
  RUNNING: 'bg-yellow-500/20 text-yellow-400',
  AGENT_DONE: 'bg-purple-500/20 text-purple-400',
  GATES_RUNNING: 'bg-cyan-500/20 text-cyan-400',
  GATES_FAILED: 'bg-red-500/20 text-red-400',
  REVIEW_REQUIRED: 'bg-orange-500/20 text-orange-400',
  APPROVED: 'bg-green-500/20 text-green-400',
  MERGED: 'bg-emerald-500/20 text-emerald-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  ARCHIVED: 'bg-gray-500/20 text-gray-400',
};

const RUN_COLORS: Record<string, string> = {
  QUEUED: 'bg-gray-500/20 text-gray-400',
  SPAWNING: 'bg-blue-500/20 text-blue-400',
  RUNNING: 'bg-yellow-500/20 text-yellow-400',
  STOPPING: 'bg-orange-500/20 text-orange-400',
  SUCCEEDED: 'bg-green-500/20 text-green-400',
  FAILED: 'bg-red-500/20 text-red-400',
  CANCELLED: 'bg-gray-500/20 text-gray-400',
};

const GATE_COLORS: Record<string, string> = {
  pending: 'bg-gray-500/20 text-gray-400',
  running: 'bg-yellow-500/20 text-yellow-400',
  passed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  skipped: 'bg-gray-500/20 text-gray-400',
};

export function TaskStatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = TASK_COLORS[status] || TASK_COLORS.DRAFT;
  return (
    <span className={cn('px-2 py-1 rounded text-xs font-medium', colorClass, className)}>
      {status}
    </span>
  );
}

export function RunStatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = RUN_COLORS[status] || 'bg-muted text-muted-foreground';
  return (
    <span className={cn('px-2 py-1 rounded text-xs font-medium', colorClass, className)}>
      {status}
    </span>
  );
}

export function GateStatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = GATE_COLORS[status] || 'bg-muted text-muted-foreground';
  return (
    <span className={cn('px-2 py-1 rounded text-xs font-medium', colorClass, className)}>
      {status}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const colors: Record<string, string> = {
    low: 'bg-gray-500/20 text-gray-400',
    medium: 'bg-blue-500/20 text-blue-400',
    high: 'bg-orange-500/20 text-orange-400',
    critical: 'bg-red-500/20 text-red-400',
  };

  return (
    <span className={cn('px-2 py-1 rounded text-xs font-medium', colors[priority] || colors.medium, className)}>
      {priority}
    </span>
  );
}
