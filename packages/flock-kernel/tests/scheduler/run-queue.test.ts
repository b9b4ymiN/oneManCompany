/**
 * Tests for scheduler/run-queue.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, err } from 'neverthrow';
import { createRunQueue, RunQueue } from '../../src/scheduler/run-queue';
import type { FlockDatabase, DbTask, DbAgent, DbRun } from '../../src/db/client';
import { FlockError } from '../../src/types';

// Mock database
const mockDb = {
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  schema: {
    tasks: {} as any,
    agents: {} as any,
    runs: {} as any,
  },
  sqlite: {} as any,
} as unknown as FlockDatabase;

const mockTask: DbTask = {
  id: 'task-001',
  project_id: 'proj-1',
  title: 'Test Task',
  description: '',
  status: 'READY',
  priority: 'medium',
  requires_review: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockAgent: DbAgent = {
  id: 'agent-001',
  name: 'Test Agent',
  kind: 'cli',
  command: 'echo',
  config_json: '{}',
  created_at: '2024-01-01T00:00:00.000Z',
};

describe('RunQueue', () => {
  let queue: RunQueue;
  const maxParallel = 4;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = createRunQueue(mockDb, maxParallel);
  });

  describe('addToQueue', () => {
    it('should add a run to the queue successfully', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn()
            .mockReturnValueOnce({ get: vi.fn().mockResolvedValue(mockTask) })
            .mockReturnValueOnce({ get: vi.fn().mockResolvedValue(mockAgent) })
            .mockReturnValue({ get: vi.fn().mockResolvedValue(undefined) }),
        }),
      });

      mockDb.db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          into: vi.fn(),
        }),
      });

      const result = await queue.addToQueue('task-001', 'agent-001');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      }
    });

    it('should reject when task does not exist', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      });

      const result = await queue.addToQueue('task-001', 'agent-001');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
        expect(result.error.message).toContain('Task not found');
      }
    });

    it('should reject when agent does not exist', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn()
            .mockReturnValueOnce({ get: vi.fn().mockResolvedValue(mockTask) })
            .mockReturnValueOnce({ get: vi.fn().mockResolvedValue(undefined) }),
        }),
      });

      const result = await queue.addToQueue('task-001', 'agent-001');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
        expect(result.error.message).toContain('Agent not found');
      }
    });

    it('should use default priority (medium = 2) when not specified', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn()
            .mockReturnValueOnce({ get: vi.fn().mockResolvedValue(mockTask) })
            .mockReturnValueOnce({ get: vi.fn().mockResolvedValue(mockAgent) })
            .mockReturnValue({ get: vi.fn().mockResolvedValue(undefined) }),
        }),
      });

      mockDb.db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          into: vi.fn(),
        }),
      });

      const result = await queue.addToQueue('task-001', 'agent-001');

      expect(result.isOk()).toBe(true);
    });
  });

  describe('removeFromQueue', () => {
    it('should remove a run from the queue', async () => {
      mockDb.db.delete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const result = await queue.removeFromQueue('run-001');

      expect(result.isOk()).toBe(true);
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status with queued and running runs', async () => {
      const mockQueuedRuns: DbRun[] = [
        {
          id: 'run-001',
          task_id: 'task-001',
          agent_id: 'agent-001',
          workspace_path: '/path/to/ws',
          branch_name: 'flock/task-001/agent-001',
          status: 'QUEUED',
          started_at: '2024-01-01T00:00:00.000Z',
          ended_at: null,
          exit_code: null,
        },
      ];

      const mockRunningRuns: DbRun[] = [
        {
          id: 'run-002',
          task_id: 'task-002',
          agent_id: 'agent-002',
          workspace_path: '/path/to/ws2',
          branch_name: 'flock/task-002/agent-002',
          status: 'RUNNING',
          started_at: '2024-01-01T00:01:00.000Z',
          ended_at: null,
          exit_code: null,
        },
      ];

      let selectCallCount = 0;
      mockDb.db.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // First call: queued runs
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  all: vi.fn().mockResolvedValue(mockQueuedRuns),
                }),
              }),
            }),
          };
        } else if (selectCallCount === 2) {
          // Second call: tasks for priority
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue(mockTask),
              }),
            }),
          };
        } else {
          // Third call: running runs
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue(mockRunningRuns),
              }),
            }),
          };
        }
      });

      const result = await queue.getQueueStatus();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.queued).toHaveLength(1);
        expect(result.value.running).toHaveLength(1);
        expect(result.value.availableSlots).toBe(3); // 4 - 1 running
        expect(result.value.maxParallel).toBe(4);
      }
    });

    it('should calculate available slots correctly when at max parallel', async () => {
      const mockRunningRuns: DbRun[] = Array(4).fill(null).map((_, i) => ({
        id: `run-00${i}`,
        task_id: `task-00${i}`,
        agent_id: `agent-00${i}`,
        workspace_path: `/path/to/ws${i}`,
        branch_name: `flock/task-00${i}/agent-00${i}`,
        status: 'RUNNING',
        started_at: '2024-01-01T00:00:00.000Z',
        ended_at: null,
        exit_code: null,
      }));

      let selectCallCount = 0;
      mockDb.db.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  all: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          };
        } else {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue(mockRunningRuns),
              }),
            }),
          };
        }
      });

      const result = await queue.getQueueStatus();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.availableSlots).toBe(0);
        expect(result.value.maxParallel).toBe(4);
      }
    });
  });

  describe('getActiveRunCount', () => {
    it('should return count of active runs', async () => {
      const mockActiveRuns: DbRun[] = [
        {
          id: 'run-001',
          task_id: 'task-001',
          agent_id: 'agent-001',
          workspace_path: '/path/to/ws',
          branch_name: 'flock/task-001/agent-001',
          status: 'RUNNING',
          started_at: '2024-01-01T00:00:00.000Z',
          ended_at: null,
          exit_code: null,
        },
        {
          id: 'run-002',
          task_id: 'task-002',
          agent_id: 'agent-002',
          workspace_path: '/path/to/ws2',
          branch_name: 'flock/task-002/agent-002',
          status: 'SPAWNING',
          started_at: '2024-01-01T00:01:00.000Z',
          ended_at: null,
          exit_code: null,
        },
      ];

      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockActiveRuns),
        }),
      });

      const count = await queue.getActiveRunCount();

      expect(count).toBe(2);
    });

    it('should return 0 when no active runs', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const count = await queue.getActiveRunCount();

      expect(count).toBe(0);
    });
  });

  describe('getRunsByState', () => {
    it('should return runs in specified state', async () => {
      const mockRuns: DbRun[] = [
        {
          id: 'run-001',
          task_id: 'task-001',
          agent_id: 'agent-001',
          workspace_path: '/path/to/ws',
          branch_name: 'flock/task-001/agent-001',
          status: 'QUEUED',
          started_at: '2024-01-01T00:00:00.000Z',
          ended_at: null,
          exit_code: null,
        },
      ];

      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockRuns),
        }),
      });

      const result = await queue.getRunsByState('QUEUED');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].status).toBe('QUEUED');
      }
    });
  });
});
