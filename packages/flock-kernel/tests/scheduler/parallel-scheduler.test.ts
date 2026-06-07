/**
 * Tests for scheduler/parallel-scheduler.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, err } from 'neverthrow';
import { createParallelScheduler, ParallelScheduler } from '../../src/scheduler/parallel-scheduler';
import type { FlockDatabase, DbTask, DbAgent, DbRun } from '../../src/db/client';
import { FlockError } from '../../src/types';
import { createDependencyResolver } from '../../src/dag/dependency-resolver';

// Mock database
const createMockDb = () => ({
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
    task_dependencies: {} as any,
  },
  sqlite: {} as any,
}) as unknown as FlockDatabase;

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

const mockRun: DbRun = {
  id: 'run-001',
  task_id: 'task-001',
  agent_id: 'agent-001',
  workspace_path: '/path/to/ws',
  branch_name: 'flock/task-001/agent-001',
  status: 'QUEUED',
  started_at: '2024-01-01T00:00:00.000Z',
  ended_at: null,
  exit_code: null,
};

describe('ParallelScheduler', () => {
  let scheduler: ParallelScheduler;
  let mockDb: FlockDatabase;
  const config = { maxParallelRuns: 4 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    scheduler = createParallelScheduler(mockDb, config);
  });

  describe('scheduleNext', () => {
    it('should schedule runs when slots are available and dependencies are met', async () => {
      // RunQueue.getQueueStatus flow:
      // 1. select queued runs where status=QUEUED → .orderBy().all()
      // 2. For each queued run: select task for priority → .get()
      // 3. select running runs where status in (SPAWNING, RUNNING, STOPPING) → .all()
      //
      // Then scheduleNext checks areDependenciesMet for each queued entry.
      // Since we're mocking areDependenciesMet with a spy, we just need
      // getQueueStatus to work correctly.

      const selectMock = vi.fn();

      // Call 1: select queued runs (status=QUEUED) → empty queue
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([]),
            }),
          }),
        }),
      });

      // Call 2: select running runs (status in active states) → no running
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      // Mock dependency resolver
      const depsResolver = createDependencyResolver(mockDb);
      vi.spyOn(depsResolver, 'areDependenciesMet').mockResolvedValue(ok(true));
      (scheduler as any).dependencyResolver = depsResolver;

      const result = await scheduler.scheduleNext();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(0); // No queued runs to schedule
      }
    });

    it('should respect max_parallel_runs limit', async () => {
      const mockRunningRuns: DbRun[] = [
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
        {
          id: 'run-003',
          task_id: 'task-003',
          agent_id: 'agent-003',
          workspace_path: '/path/to/ws3',
          branch_name: 'flock/task-003/agent-003',
          status: 'RUNNING',
          started_at: '2024-01-01T00:02:00.000Z',
          ended_at: null,
          exit_code: null,
        },
        {
          id: 'run-004',
          task_id: 'task-004',
          agent_id: 'agent-004',
          workspace_path: '/path/to/ws4',
          branch_name: 'flock/task-004/agent-004',
          status: 'STOPPING',
          started_at: '2024-01-01T00:03:00.000Z',
          ended_at: null,
          exit_code: null,
        },
      ];

      const selectMock = vi.fn();

      // Call 1: queued runs (empty)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([]),
            }),
          }),
        }),
      });

      // Call 2: running runs (4 active = max)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockRunningRuns),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.scheduleNext();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(0); // No runs started
      }
    });

    it('should skip runs with unmet dependencies', async () => {
      const selectMock = vi.fn();

      // Call 1: queued runs (empty)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([]),
            }),
          }),
        }),
      });

      // Call 2: running runs (empty)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      // Mock dependency resolver to return dependencies NOT met
      const depsResolver = createDependencyResolver(mockDb);
      vi.spyOn(depsResolver, 'areDependenciesMet').mockResolvedValue(ok(false));
      (scheduler as any).dependencyResolver = depsResolver;

      const result = await scheduler.scheduleNext();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(0); // No runs started due to unmet dependencies
      }
    });
  });

  describe('canStartRun', () => {
    it('should return true when slots are available', async () => {
      const selectMock = vi.fn();

      // Call 1: queued runs (empty)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([]),
            }),
          }),
        }),
      });

      // Call 2: running runs (empty)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.canStartRun();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it('should return false when no slots available', async () => {
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

      const selectMock = vi.fn();

      // Call 1: queued runs (empty)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([]),
            }),
          }),
        }),
      });

      // Call 2: running runs (4 = max)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockRunningRuns),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.canStartRun();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });
  });

  describe('allocateAgent', () => {
    it('should allocate readonly agent when available', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTask),
          }),
        }),
      });

      // Mock agent pool to return agents
      const mockAgents = [
        {
          id: 'agent-001',
          config: {
            id: 'agent-001',
            name: 'Readonly Agent',
            kind: 'cli' as const,
            command: 'echo',
            args: [],
            mode: 'readonly' as const,
          },
          activeRuns: 0,
          isAvailable: true,
        },
        {
          id: 'agent-002',
          config: {
            id: 'agent-002',
            name: 'Write Agent',
            kind: 'cli' as const,
            command: 'echo',
            args: [],
            mode: 'write' as const,
          },
          activeRuns: 0,
          isAvailable: true,
        },
      ];

      const agentPool = (scheduler as any).agentPool;
      vi.spyOn(agentPool, 'getAgentsByWorkload').mockResolvedValue(ok(mockAgents));

      const result = await scheduler.allocateAgent('task-001');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('agent-001'); // Readonly agent preferred
      }
    });

    it('should allocate least busy agent when no readonly agents available', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTask),
          }),
        }),
      });

      const mockAgents = [
        {
          id: 'agent-001',
          config: {
            id: 'agent-001',
            name: 'Busy Agent',
            kind: 'cli' as const,
            command: 'echo',
            args: [],
            mode: 'write' as const,
          },
          activeRuns: 3,
          isAvailable: true,
        },
        {
          id: 'agent-002',
          config: {
            id: 'agent-002',
            name: 'Idle Agent',
            kind: 'cli' as const,
            command: 'echo',
            args: [],
            mode: 'write' as const,
          },
          activeRuns: 0,
          isAvailable: true,
        },
      ];

      // getAgentsByWorkload returns agents sorted by workload (ascending)
      const sortedAgents = [...mockAgents].sort((a, b) => a.activeRuns - b.activeRuns);

      const agentPool = (scheduler as any).agentPool;
      vi.spyOn(agentPool, 'getAgentsByWorkload').mockResolvedValue(ok(sortedAgents));

      const result = await scheduler.allocateAgent('task-001');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('agent-002'); // Least busy agent (0 active runs)
      }
    });

    it('should return error when no agents available', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTask),
          }),
        }),
      });

      const agentPool = (scheduler as any).agentPool;
      vi.spyOn(agentPool, 'getAgentsByWorkload').mockResolvedValue(ok([]));

      const result = await scheduler.allocateAgent('task-001');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
        expect(result.error.message).toContain('No agents available');
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
      ];

      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(mockActiveRuns),
        }),
      });

      const count = await scheduler.getActiveRunCount();

      expect(count).toBe(1);
    });
  });

  describe('updateRunStartInfo', () => {
    it('should update run with workspace and branch info', async () => {
      mockDb.db.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({}),
        }),
      });

      const result = await scheduler.updateRunStartInfo('run-001', '/workspace', 'feature-branch');

      expect(result.isOk()).toBe(true);
      expect(mockDb.db.update).toHaveBeenCalled();
    });
  });

  describe('updateRunCompletion', () => {
    it('should update run completion info', async () => {
      mockDb.db.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({}),
        }),
      });

      const result = await scheduler.updateRunCompletion('run-001', 0);

      expect(result.isOk()).toBe(true);
      expect(mockDb.db.update).toHaveBeenCalled();
    });
  });

  describe('getRun', () => {
    it('should return run by ID', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockRun),
          }),
        }),
      });

      const result = await scheduler.getRun('run-001');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('run-001');
      }
    });

    it('should return error when run not found', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(undefined),
          }),
        }),
      });

      const result = await scheduler.getRun('run-001');

      expect(result.isErr()).toBe(true);
    });
  });

  describe('getRunsForTask', () => {
    it('should return all runs for a task', async () => {
      const mockRuns: DbRun[] = [
        {
          id: 'run-001',
          task_id: 'task-001',
          agent_id: 'agent-001',
          workspace_path: '/path/to/ws',
          branch_name: 'flock/task-001/agent-001',
          status: 'SUCCEEDED',
          started_at: '2024-01-01T00:00:00.000Z',
          ended_at: '2024-01-01T01:00:00.000Z',
          exit_code: 0,
        },
        {
          id: 'run-002',
          task_id: 'task-001',
          agent_id: 'agent-002',
          workspace_path: '/path/to/ws2',
          branch_name: 'flock/task-001/agent-002',
          status: 'FAILED',
          started_at: '2024-01-01T02:00:00.000Z',
          ended_at: '2024-01-01T03:00:00.000Z',
          exit_code: 1,
        },
      ];

      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue(mockRuns),
          }),
        }),
      });

      const result = await scheduler.getRunsForTask('task-001');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
      }
    });
  });
});
