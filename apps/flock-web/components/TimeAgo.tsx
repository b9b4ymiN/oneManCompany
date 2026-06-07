interface TimeAgoProps {
  timestamp: string | Date;
  className?: string;
}

export function TimeAgo({ timestamp, className }: TimeAgoProps) {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  let text: string;
  if (diffSecs < 60) {
    text = 'just now';
  } else if (diffMins < 60) {
    text = `${diffMins}m ago`;
  } else if (diffHours < 24) {
    text = `${diffHours}h ago`;
  } else if (diffDays < 7) {
    text = `${diffDays}d ago`;
  } else {
    text = date.toLocaleDateString();
  }

  return (
    <time className={className} dateTime={date.toISOString()} title={date.toLocaleString()}>
      {text}
    </time>
  );
}
