'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getRun } from '@/lib/api-client';
import { RunStatusBadge } from '@/components/StatusBadge';
import { useSSE, type SSEEvent } from '@/hooks/useSSE';
import { TimeAgo } from '@/components/TimeAgo';

type LogLine = {
  id: string;
  timestamp: string;
  type: 'stdout' | 'stderr' | 'event' | 'system';
  content: string;
};

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logs, setLogs] = useState<LogLine[]>([]);

  const { data: run, isLoading } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => getRun(runId),
    refetchInterval: (query) => {
      // Poll for active runs
      const data = query.state.data;
      if (data && ['RUNNING', 'SPAWNING'].includes(data.status)) {
        return 3000;
      }
      return false;
    },
  });

  // SSE for real-time events
  const { events, isConnected } = useSSE({
    filterRunId: runId,
    enabled: run?.status === 'RUNNING' || run?.status === 'SPAWNING',
  });

  // Convert SSE events to log lines
  useEffect(() => {
    if (events.length === 0) return;

    const newLogs = events.map((event): LogLine => {
      const content = formatEventContent(event);
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: determineLogType(event),
        content,
      };
    });

    setLogs((prev) => [...prev, ...newLogs]);
  }, [events]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Handle run completion
  useEffect(() => {
    if (!run) return;

    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(run.status)) {
      // Add a completion message
      setLogs((prev) => [
        ...prev,
        {
          id: `completion-${run.id}`,
          timestamp: new Date().toISOString(),
          type: 'system',
          content: `Run ${run.status.toLowerCase()}${run.exit_code !== undefined ? ` with exit code ${run.exit_code}` : ''}`,
        },
      ]);
    }
  }, [run]);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-8 text-muted-foreground">Loading run details...</div>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto text-center py-8">
          <h2 className="text-xl font-semibold mb-2">Run not found</h2>
          <Link href="/projects" className="text-primary hover:underline">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const isActive = run.status === 'RUNNING' || run.status === 'SPAWNING';
  const duration = run.ended_at
    ? formatDuration(run.started_at!, run.ended_at)
    : run.started_at
      ? formatDuration(run.started_at, new Date().toISOString())
      : '-';

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href={`/tasks/${run.task_id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to Task
          </Link>
          <div className="flex items-start justify-between mt-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">Run {run.id.slice(0, 8)}</h1>
                <RunStatusBadge status={run.status} />
                {isActive && isConnected && (
                  <span className="flex items-center gap-2 text-sm text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    Connected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span>Agent: <span className="font-mono">{run.agent_id}</span></span>
                <span>•</span>
                <span>Branch: <span className="font-mono">{run.branch_name}</span></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
            <span>Started: {run.started_at ? <TimeAgo timestamp={run.started_at} /> : '-'}</span>
            {run.ended_at && (
              <>
                <span>•</span>
                <span>Ended: <TimeAgo timestamp={run.ended_at} /></span>
              </>
            )}
            <span>•</span>
            <span>Duration: {duration}</span>
            {run.exit_code !== undefined && (
              <>
                <span>•</span>
                <span className={run.exit_code === 0 ? 'text-green-400' : 'text-red-400'}>
                  Exit Code: {run.exit_code}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Live Logs */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {/* Log Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">Event Logs</h2>
              {isActive && (
                <span className="flex items-center gap-2 text-sm text-yellow-400">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  autoScroll
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {autoScroll ? 'Pause Scroll' : 'Auto Scroll'}
              </button>
              {logs.length > 0 && (
                <button
                  onClick={() => setLogs([])}
                  className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Log Content */}
          <div
            ref={logContainerRef}
            className="h-[600px] overflow-y-auto bg-black/90 p-4 font-mono text-sm"
          >
            {logs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p>{isActive ? 'Waiting for events...' : 'No events recorded'}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((log) => (
                  <LogLine key={log.id} log={log} />
                ))}
                {isActive && (
                  <div className="flex items-center gap-2 text-yellow-400 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    <span>Streaming...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {isActive && (
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => {
                // TODO: Implement cancel run
                console.log('Cancel run:', runId);
              }}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
            >
              Cancel Run
            </button>
          </div>
        )}

        {/* Failure Summary */}
        {run.status === 'FAILED' && run.exit_code !== 0 && (
          <div className="mt-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <h3 className="font-semibold text-red-400 mb-2">Run Failed</h3>
            <p className="text-sm text-muted-foreground">
              The run exited with code {run.exit_code}. Check the logs above for details.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function LogLine({ log }: { log: LogLine }) {
  const colorClass = {
    stdout: 'text-white',
    stderr: 'text-red-300',
    event: 'text-blue-300',
    system: 'text-yellow-300',
  }[log.type];

  const timestamp = new Date(log.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="flex items-start gap-2 py-0.5 px-2 hover:bg-white/5 rounded">
      <span className="text-muted-foreground text-xs shrink-0">[{timestamp}]</span>
      {log.type !== 'stdout' && (
        <span className={`text-xs shrink-0 uppercase ${colorClass}`}>
          {log.type}:
        </span>
      )}
      <span className={`${colorClass} break-all whitespace-pre-wrap`}>
        {log.content}
      </span>
    </div>
  );
}

function formatEventContent(event: SSEEvent): string {
  switch (event.type) {
    case 'run.started':
      return `Run started`;
    case 'run.ended':
      return `Run ended with exit code ${event.data.exitCode}`;
    case 'run.output':
      return String(event.data.output || '');
    case 'run.error':
      return `Error: ${event.data.message}`;
    case 'agent.thinking':
      return `Thinking: ${event.data.thought}`;
    case 'agent.tool_call':
      return `Tool called: ${event.data.tool} ${JSON.stringify(event.data.args)}`;
    case 'agent.tool_result':
      return `Tool result: ${event.data.tool}`;
    default:
      return JSON.stringify(event.data);
  }
}

function determineLogType(event: SSEEvent): LogLine['type'] {
  switch (event.type) {
    case 'run.started':
    case 'run.ended':
      return 'system';
    case 'run.output':
      return event.data.stream === 'stderr' ? 'stderr' : 'stdout';
    case 'run.error':
      return 'stderr';
    case 'agent.thinking':
    case 'agent.tool_call':
    case 'agent.tool_result':
      return 'event';
    default:
      return 'event';
  }
}

function formatDuration(start: string, end: string): string {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
