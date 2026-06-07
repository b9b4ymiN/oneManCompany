'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export interface SSEEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface UseSSEOptions {
  filterRunId?: string;
  filterTaskId?: string;
  enabled?: boolean;
}

export interface UseSSEResult {
  events: SSEEvent[];
  isConnected: boolean;
  error: Error | null;
  reconnect: () => void;
}

/**
 * SSE Hook for real-time event streaming
 * Connects to /api/events/stream and receives events
 */
export function useSSE(options: UseSSEOptions = {}): UseSSEResult {
  const { filterRunId, filterTaskId, enabled = true } = options;

  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Build URL with filters
    const params = new URLSearchParams();
    if (filterRunId) params.append('runId', filterRunId);
    if (filterTaskId) params.append('taskId', filterTaskId);

    const url = `/api/events/stream${params.toString() ? '?' + params.toString() : ''}`;

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      eventSource.onerror = (err) => {
        setIsConnected(false);
        setError(new Error('SSE connection error'));

        // Auto-reconnect after 3 seconds
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SSEEvent;
          setEvents((prev) => [...prev, data]);
        } catch {
          // Ignore parse errors
        }
      };

    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create SSE connection'));
      setIsConnected(false);
    }
  }, [filterRunId, filterTaskId, enabled]);

  const reconnect = useCallback(() => {
    setEvents([]);
    connect();
  }, [connect]);

  useEffect(() => {
    if (!enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      return;
    }

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect, enabled]);

  return {
    events,
    isConnected,
    error,
    reconnect,
  };
}
