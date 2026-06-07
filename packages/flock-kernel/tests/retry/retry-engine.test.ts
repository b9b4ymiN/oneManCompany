/**
 * Tests for retry/retry-engine.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, err } from 'neverthrow';
import { createRetryEngine, RetryEngine } from '../../src/retry/retry-engine';
import type { FlockDatabase, DbRun, DbTask } from '../../src/db/client';

// Mock database
const mockDb = {
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  schema: {
    runs: {} as any,
    tasks: {} as any,
    retry_history: {} as any,
  },
  sqlite: {} as any,
} as unknown as FlockDatabase;

// Mock event logger
const mockEventLogger = {
  logEvent: vi.fn().mockReturnValue(undefined),
  getEvents: vi.fn().mockReturnValue([]),
};

const mockTask: DbTask = {
  id: 'task-001',
  project_id: 'proj-1',
  title: 'Test Task',
  description: '',
  status: 'GATES_FAILED',
  priority: 'medium',
  requires_review: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockRun: DbRun = {
  id: 'run-001',
  task_id: 'task-001',
  agent_id: 'agent-001',
  workspace_path: '/tmp/workspace',
  branch_name: 'flock/task-001/agent-001',
  status: 'FAILED',
  exit_code: 1,
  started_at: '2024-01-01T00:00:00.000Z',
  ended_at: '2024-01-01T00:01:00.000Z',
};

describe('RetryEngine', () => {
  let retryEngine: RetryEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    retryEngine = createRetryEngine(mockDb, mockEventLogger as any);
  });

  describe('evaluateRetry', () => {
    it('should allow retry on gate failure when configured', async () => {
      // evaluateRetry flow:
      // 1. select run by runId → .get()
      // 2. select task by run.task_id → .get()
      // 3. getRetryHistory → select runs where task_id → .orderBy().all()
      //    then for each run: getEvents(run.id) → returns []
      const selectMock = vi.fn();

      // Call 1: select run
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockRun),
          }),
        }),
      });

      // Call 2: select task
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTask),
          }),
        }),
      });

      // Call 3: getRetryHistory → select runs for task → .orderBy().all()
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([]),
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;
      mockEventLogger.getEvents.mockReturnValue([]);

      const policy = {
        maxRetries: 3,
        retryOnGateFailure: true,
        retryOnAgentCrash: true,
        backoffMultiplier: 2,
        initialDelayMs: 1000,
      };

      const result = await retryEngine.evaluateRetry('run-001', policy);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.shouldRetry).toBe(true);
        expect(result.value.attempt).toBe(1);
      }
    });

    it('should not allow retry when max retries exceeded', async () => {
      const selectMock = vi.fn();

      // Call 1: select run
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              ...mockRun,
              exit_code: 1,
            }),
          }),
        }),
      });

      // Call 2: select task
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTask),
          }),
        }),
      });

      // Call 3: getRetryHistory → select runs for task → returns 3 runs
      const mockRuns = [
        { ...mockRun, id: 'run-001' },
        { ...mockRun, id: 'run-002' },
        { ...mockRun, id: 'run-003' },
      ];
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue(mockRuns),
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      // Each run has a retry_triggered event
      mockEventLogger.getEvents.mockImplementation((runId: string) => {
        return [
          {
            id: `event-${runId}`,
            type: 'retry_triggered',
            payload: { retryRunId: `retry-${runId}`, attempt: 1, reason: 'Gate failed' },
            created_at: '2024-01-01T00:00:00.000Z',
          },
        ];
      });

      const policy = {
        maxRetries: 3,
        retryOnGateFailure: true,
        retryOnAgentCrash: true,
        backoffMultiplier: 2,
        initialDelayMs: 1000,
      };

      const result = await retryEngine.evaluateRetry('run-001', policy);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.shouldRetry).toBe(false);
        expect(result.value.maxRetriesExceeded).toBe(true);
      }
    });

    it('should not allow retry when failure type not configured', async () => {
      const selectMock = vi.fn();

      // Call 1: select run (exit_code 0, no crash)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              ...mockRun,
              status: 'COMPLETED',
              exit_code: 0,
            }),
          }),
        }),
      });

      // Call 2: select task (not GATES_FAILED)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              ...mockTask,
              status: 'SUCCEEDED',
            }),
          }),
        }),
      });

      // Call 3: getRetryHistory
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([]),
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;
      mockEventLogger.getEvents.mockReturnValue([]);

      const policy = {
        maxRetries: 3,
        retryOnGateFailure: true,
        retryOnAgentCrash: true,
        backoffMultiplier: 2,
        initialDelayMs: 1000,
      };

      const result = await retryEngine.evaluateRetry('run-001', policy);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.shouldRetry).toBe(false);
      }
    });
  });

  describe('executeRetry', () => {
    it('should create a new run for retry', async () => {
      // executeRetry flow:
      // 1. select task → .get()
      // 2. select last run (orderBy desc, limit 1) → .get()
      // 3. getRetryHistory → select runs → .orderBy().all() + getEvents
      // 4. insert new run → .values()
      // 5. eventLogger.logEvent
      // 6. update task status → .set().where()
      // 7. select new run → .get()
      const selectMock = vi.fn();

      // Call 1: select task
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTask),
          }),
        }),
      });

      // Call 2: select last run (with orderBy + limit)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockReturnValue(mockRun),
              }),
            }),
          }),
        }),
      });

      // Call 3: getRetryHistory → select runs for task
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([]),
            }),
          }),
        }),
      });

      // Call 4: select new run after insert
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'run-002',
              task_id: 'task-001',
              agent_id: 'agent-001',
              workspace_path: '/tmp/workspace',
              branch_name: 'flock/task-001/agent-001',
              status: 'QUEUED',
              started_at: '2024-01-01T00:02:00.000Z',
              ended_at: null,
              exit_code: null,
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;
      mockEventLogger.getEvents.mockReturnValue([]);

      mockDb.db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({}),
      });

      mockDb.db.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({}),
        }),
      });

      const policy = {
        maxRetries: 3,
        retryOnGateFailure: true,
        retryOnAgentCrash: true,
        backoffMultiplier: 2,
        initialDelayMs: 1000,
      };

      const result = await retryEngine.executeRetry('task-001', policy);

      expect(result.isOk()).toBe(true);
    });
  });

  describe('shouldEscalate', () => {
    it('should return true when max retries exceeded', async () => {
      // shouldEscalate calls getRetryHistory which:
      // 1. select runs where task_id → .orderBy().all()
      // 2. for each run: getEvents(run.id)
      const selectMock = vi.fn();

      const mockRuns = [
        { ...mockRun, id: 'run-001' },
        { ...mockRun, id: 'run-002' },
        { ...mockRun, id: 'run-003' },
      ];

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue(mockRuns),
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      mockEventLogger.getEvents.mockImplementation((runId: string) => {
        return [
          {
            id: `event-${runId}`,
            type: 'retry_triggered',
            payload: { retryRunId: `retry-${runId}`, attempt: 1, reason: 'Gate failed' },
            created_at: '2024-01-01T00:00:00.000Z',
          },
        ];
      });

      const policy = {
        maxRetries: 3,
        retryOnGateFailure: true,
        retryOnAgentCrash: true,
        backoffMultiplier: 2,
        initialDelayMs: 1000,
      };

      const result = await retryEngine.shouldEscalate('task-001', policy);

      expect(result).toBe(true);
    });

    it('should return false when retries remain', async () => {
      const selectMock = vi.fn();

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([{ ...mockRun, id: 'run-001' }]),
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      mockEventLogger.getEvents.mockImplementation((runId: string) => {
        return [
          {
            id: `event-${runId}`,
            type: 'retry_triggered',
            payload: { retryRunId: `retry-${runId}`, attempt: 1, reason: 'Gate failed' },
            created_at: '2024-01-01T00:00:00.000Z',
          },
        ];
      });

      const policy = {
        maxRetries: 3,
        retryOnGateFailure: true,
        retryOnAgentCrash: true,
        backoffMultiplier: 2,
        initialDelayMs: 1000,
      };

      const result = await retryEngine.shouldEscalate('task-001', policy);

      expect(result).toBe(false);
    });
  });
});
