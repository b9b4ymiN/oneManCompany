import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon = '📭', message, action, className }: EmptyStateProps) {
  return (
    <div className={cn('text-center py-12', className)}>
      <div className="text-5xl mb-4">{icon}</div>
      <p className="text-muted-foreground">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
