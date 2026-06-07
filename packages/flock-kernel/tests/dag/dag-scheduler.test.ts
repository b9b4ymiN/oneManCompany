/**
 * Tests for dag/dag-scheduler.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDAGScheduler, DAGScheduler } from '../../src/dag/dag-scheduler';
import type { FlockDatabase, DbTask, DbTaskDependency } from '../../src/db/client';

// Mock database
const mockDb = {
  db: {
    select: vi.fn(),
  },
  schema: {
    tasks: {} as any,
    task_dependencies: {} as any,
  },
  sqlite: {} as any,
} as unknown as FlockDatabase;

describe('DAGScheduler', () => {
  let scheduler: DAGScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = createDAGScheduler(mockDb);
  });

  describe('getReadyTasks', () => {
    it('should return empty array when no tasks are ready', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      const selectMock = vi.fn();

      // Call 1: get all project tasks
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      // Call 2: getDependencies for task-001 → has deps
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ task_id: 'task-001', depends_on_task_id: 'task-002' }]),
          }),
        }),
      });

      // Call 3: check dep task status (RUNNING - not terminal)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'task-002',
              project_id: 'proj-1',
              title: 'Task 2',
              description: '',
              status: 'RUNNING',
              priority: 'medium',
              requires_review: false,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.getReadyTasks('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return tasks with no dependencies and in ready state', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'READY', priority: 'high', requires_review: false, created_at: '2024-01-01T01:00:00.000Z', updated_at: '2024-01-01T01:00:00.000Z' },
      ];

      const selectMock = vi.fn();

      // Call 1: get all project tasks
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      // Call 2: getDependencies for task-001 → empty
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      // Call 3: getDependencies for task-002 → empty
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.getReadyTasks('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('task-001');
        expect(result.value).toContain('task-002');
      }
    });

    it('should return tasks whose dependencies are in terminal state', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'READY', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      const selectMock = vi.fn();

      // Call 1: get all project tasks
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      // Call 2: getDependencies for task-001 → has dep on task-002
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ task_id: 'task-001', depends_on_task_id: 'task-002' }]),
          }),
        }),
      });

      // Call 3: check dep task-002 status (MERGED - terminal)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'task-002',
              project_id: 'proj-1',
              title: 'Task 2',
              description: '',
              status: 'MERGED',
              priority: 'medium',
              requires_review: false,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.getReadyTasks('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('task-001');
      }
    });

    it('should not return tasks in non-ready states', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'RUNNING', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'MERGED', priority: 'medium', requires_review: false, created_at: '2024-01-01T01:00:00.000Z', updated_at: '2024-01-01T01:00:00.000Z' },
      ];

      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      const result = await scheduler.getReadyTasks('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('should not return tasks with unmet dependencies', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'READY', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      const selectMock = vi.fn();

      // Call 1: get all project tasks
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      // Call 2: getDependencies for task-001 → dep on task-002
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ task_id: 'task-001', depends_on_task_id: 'task-002' }]),
          }),
        }),
      });

      // Call 3: check dep task-002 (RUNNING - not terminal)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'task-002',
              project_id: 'proj-1',
              title: 'Task 2',
              description: '',
              status: 'RUNNING',
              priority: 'medium',
              requires_review: false,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.getReadyTasks('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getNextTask', () => {
    it('should return null when no tasks are ready', async () => {
      // All tasks in RUNNING state — none are in DRAFT/READY
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'RUNNING', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      const result = await scheduler.getNextTask('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('should return the highest priority ready task', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'READY', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'READY', priority: 'critical', requires_review: false, created_at: '2024-01-01T01:00:00.000Z', updated_at: '2024-01-01T01:00:00.000Z' },
        { id: 'task-003', project_id: 'proj-1', title: 'Task 3', description: '', status: 'READY', priority: 'low', requires_review: false, created_at: '2024-01-01T02:00:00.000Z', updated_at: '2024-01-01T02:00:00.000Z' },
      ];

      const selectMock = vi.fn();

      // Call 1: get all project tasks
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      // Calls 2-4: getDependencies for each task (all empty)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      // Calls 5-7: getNextTask fetches each ready task individually for priority sort
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks[0]), // task-001 medium
          }),
        }),
      });
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks[1]), // task-002 critical
          }),
        }),
      });
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks[2]), // task-003 low
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.getNextTask('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('task-002'); // critical priority
      }
    });

    it('should break priority ties by oldest creation time', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'READY', priority: 'high', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'READY', priority: 'high', requires_review: false, created_at: '2024-01-01T01:00:00.000Z', updated_at: '2024-01-01T01:00:00.000Z' },
      ];

      const selectMock = vi.fn();

      // Call 1: get all project tasks
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      // Calls 2-3: getDependencies for each task (all empty)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      // Calls 4-5: getNextTask fetches each ready task individually
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks[0]), // task-001 older
          }),
        }),
      });
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks[1]), // task-002 newer
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.getNextTask('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('task-001'); // Older task
      }
    });
  });

  describe('propagateStatus', () => {
    it('should return empty array for non-terminal states', async () => {
      const result = await scheduler.propagateStatus('task-001', 'RUNNING');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return empty array for READY state', async () => {
      const result = await scheduler.propagateStatus('task-001', 'READY');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return unblocked dependents when task reaches MERGED', async () => {
      const selectMock = vi.fn();

      // Call 1: getDependents → select with .where().all()
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([
              { task_id: 'task-002', depends_on_task_id: 'task-001' },
              { task_id: 'task-003', depends_on_task_id: 'task-001' },
            ]),
          }),
        }),
      });

      // Call 2: areDependenciesMet for task-002 → getDependencies
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ task_id: 'task-002', depends_on_task_id: 'task-001' }]),
          }),
        }),
      });

      // Call 3: areDependenciesMet for task-002 → check dep task-001 (MERGED)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'task-001',
              project_id: 'proj-1',
              title: 'Task 1',
              description: '',
              status: 'MERGED',
              priority: 'medium',
              requires_review: false,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            }),
          }),
        }),
      });

      // Call 4: areDependenciesMet for task-003 → getDependencies
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ task_id: 'task-003', depends_on_task_id: 'task-001' }]),
          }),
        }),
      });

      // Call 5: areDependenciesMet for task-003 → check dep task-001 (MERGED)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'task-001',
              project_id: 'proj-1',
              title: 'Task 1',
              description: '',
              status: 'MERGED',
              priority: 'medium',
              requires_review: false,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.propagateStatus('task-001', 'MERGED');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('task-002');
        expect(result.value).toContain('task-003');
      }
    });

    it('should not return dependents that still have unmet dependencies', async () => {
      const selectMock = vi.fn();

      // Call 1: getDependents
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([
              { task_id: 'task-002', depends_on_task_id: 'task-001' },
            ]),
          }),
        }),
      });

      // Call 2: getDependencies for task-002 → two deps
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([
              { task_id: 'task-002', depends_on_task_id: 'task-001' },
              { task_id: 'task-002', depends_on_task_id: 'task-003' },
            ]),
          }),
        }),
      });

      // Call 3: check dep task-001 (MERGED - terminal)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'task-001',
              project_id: 'proj-1',
              title: 'Task 1',
              description: '',
              status: 'MERGED',
              priority: 'medium',
              requires_review: false,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            }),
          }),
        }),
      });

      // Call 4: check dep task-003 (RUNNING - not terminal)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'task-003',
              project_id: 'proj-1',
              title: 'Task 3',
              description: '',
              status: 'RUNNING',
              priority: 'medium',
              requires_review: false,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.propagateStatus('task-001', 'MERGED');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]); // task-002 not unblocked because task-003 is still running
      }
    });

    it('should propagate for APPROVED state', async () => {
      const selectMock = vi.fn();

      // Call 1: getDependents
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([
              { task_id: 'task-002', depends_on_task_id: 'task-001' },
            ]),
          }),
        }),
      });

      // Call 2: getDependencies for task-002
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ task_id: 'task-002', depends_on_task_id: 'task-001' }]),
          }),
        }),
      });

      // Call 3: check dep task-001 (APPROVED - terminal)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'task-001',
              project_id: 'proj-1',
              title: 'Task 1',
              description: '',
              status: 'APPROVED',
              priority: 'medium',
              requires_review: false,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.propagateStatus('task-001', 'APPROVED');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('task-002');
      }
    });

    it('should propagate for ARCHIVED state', async () => {
      const selectMock = vi.fn();

      // Call 1: getDependents
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([
              { task_id: 'task-002', depends_on_task_id: 'task-001' },
            ]),
          }),
        }),
      });

      // Call 2: getDependencies for task-002
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ task_id: 'task-002', depends_on_task_id: 'task-001' }]),
          }),
        }),
      });

      // Call 3: check dep task-001 (ARCHIVED - terminal)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'task-001',
              project_id: 'proj-1',
              title: 'Task 1',
              description: '',
              status: 'ARCHIVED',
              priority: 'medium',
              requires_review: false,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.propagateStatus('task-001', 'ARCHIVED');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('task-002');
      }
    });
  });

  describe('getBlockingChain', () => {
    it('should return all transitive dependencies blocking a task', async () => {
      const selectMock = vi.fn();

      // Call 1: getDependencies for task-003 → dep on task-002
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ task_id: 'task-003', depends_on_task_id: 'task-002' }]),
          }),
        }),
      });

      // Call 2: getDependencies for task-002 → dep on task-001
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ task_id: 'task-002', depends_on_task_id: 'task-001' }]),
          }),
        }),
      });

      // Call 3: getDependencies for task-001 → no deps
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.getBlockingChain('task-003');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('task-002');
        expect(result.value).toContain('task-001');
      }
    });

    it('should return empty array when task has no dependencies', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      const result = await scheduler.getBlockingChain('task-001');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getBlockedChain', () => {
    it('should return all transitive dependents blocked by this task', async () => {
      const selectMock = vi.fn();

      // Call 1: getDependents for task-001 → task-002 depends on it
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ task_id: 'task-002', depends_on_task_id: 'task-001' }]),
          }),
        }),
      });

      // Call 2: getDependents for task-002 → task-003 depends on it
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ task_id: 'task-003', depends_on_task_id: 'task-002' }]),
          }),
        }),
      });

      // Call 3: getDependents for task-003 → nothing
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await scheduler.getBlockedChain('task-001');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('task-002');
        expect(result.value).toContain('task-003');
      }
    });

    it('should return empty array when no tasks depend on this task', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      const result = await scheduler.getBlockedChain('task-001');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });
});
