import { cn } from '@/lib/utils';

interface AgentIconProps {
  type: 'cli' | string;
  className?: string;
}

const ICONS: Record<string, string> = {
  cli: '⚡',
  default: '🤖',
};

export function AgentIcon({ type, className }: AgentIconProps) {
  const icon = ICONS[type] || ICONS.default;
  return (
    <span className={cn('text-lg', className)} role="img" aria-label={`Agent type: ${type}`}>
      {icon}
    </span>
  );
}
