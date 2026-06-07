/**
 * Tests for dag/dependency-resolver.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, err } from 'neverthrow';
import { createDependencyResolver, DependencyResolver } from '../../src/dag/dependency-resolver';
import type { FlockDatabase, DbTask } from '../../src/db/client';
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
    task_dependencies: {} as any,
  },
  sqlite: {} as any,
} as unknown as FlockDatabase;

const mockTasks: Record<string, DbTask> = {
  'task-001': {
    id: 'task-001',
    project_id: 'proj-1',
    title: 'Task 1',
    description: '',
    status: 'MERGED',
    priority: 'medium',
    requires_review: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  'task-002': {
    id: 'task-002',
    project_id: 'proj-1',
    title: 'Task 2',
    description: '',
    status: 'READY',
    priority: 'medium',
    requires_review: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  'task-003': {
    id: 'task-003',
    project_id: 'proj-1',
    title: 'Task 3',
    description: '',
    status: 'DRAFT',
    priority: 'medium',
    requires_review: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
};

describe('DependencyResolver', () => {
  let resolver: DependencyResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = createDependencyResolver(mockDb);
  });

  describe('addDependency', () => {
    it('should add a dependency successfully', async () => {
      // The implementation does:
      // 1. Promise.all: select task-002 (get), select task-001 (get) — two parallel selects
      // 2. wouldCreateCycle → buildAdjacencyMap → select all deps (all) — no .where()
      // 3. Check existing dep: select with .where().get()
      // 4. Insert
      const selectMock = vi.fn();

      // Call 1 & 2: task validation (Promise.all — two select calls)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks['task-002']),
          }),
        }),
      });
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks['task-001']),
          }),
        }),
      });

      // Call 3: buildAdjacencyMap — select from task_dependencies, no .where()
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue([]),
        }),
      });

      // Call 4: check existing dependency
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(undefined), // No existing dependency
          }),
        }),
      });

      mockDb.db.select = selectMock;
      mockDb.db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({}),
      });

      const result = await resolver.addDependency('task-002', 'task-001');

      expect(result.isOk()).toBe(true);
    });

    it('should prevent self-dependency', async () => {
      const result = await resolver.addDependency('task-001', 'task-001');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DATABASE_ERROR');
        expect(result.error.message).toContain('cannot depend on itself');
      }
    });

    it('should detect circular dependency', async () => {
      // Setup: task-001 already depends on task-002 (in adjacency map)
      // We're adding task-002 -> task-001, which would create a cycle.
      //
      // Implementation flow:
      // 1. Promise.all: select task-001 (get), select task-002 (get)
      // 2. wouldCreateCycle → buildAdjacencyMap → select all deps (all) — no .where()
      //    The adjacency map will show: task-001 -> [task-002]
      //    Adding task-002 -> task-001 creates a cycle since path from task-001 to task-002 exists.
      const selectMock = vi.fn();

      // Call 1: select task-001 (first arg taskId)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks['task-001']),
          }),
        }),
      });

      // Call 2: select task-002 (second arg dependsOnTaskId)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks['task-002']),
          }),
        }),
      });

      // Call 3: buildAdjacencyMap — select all deps (no .where()) returns existing dep
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue([{ task_id: 'task-001', depends_on_task_id: 'task-002' }]),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await resolver.addDependency('task-002', 'task-001');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('cycle');
      }
    });

    it('should return error if task not found', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(undefined),
          }),
        }),
      });

      const result = await resolver.addDependency('nonexistent', 'task-001');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('should be idempotent for existing dependencies', async () => {
      // Implementation flow:
      // 1. Promise.all: select task-002 (get), select task-001 (get)
      // 2. wouldCreateCycle → buildAdjacencyMap → select all deps (all)
      // 3. Check existing dep: select with .where().get() → returns existing dep
      // No insert happens because existing dep is found.
      const selectMock = vi.fn();

      // Call 1: select task-002
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks['task-002']),
          }),
        }),
      });

      // Call 2: select task-001
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks['task-001']),
          }),
        }),
      });

      // Call 3: buildAdjacencyMap — no .where(), returns all deps
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue([{ task_id: 'task-002', depends_on_task_id: 'task-001' }]),
        }),
      });

      // Call 4: check existing dependency — returns the existing dep
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({ task_id: 'task-002', depends_on_task_id: 'task-001' }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await resolver.addDependency('task-002', 'task-001');

      expect(result.isOk()).toBe(true);
    });
  });

  describe('removeDependency', () => {
    it('should remove a dependency successfully', async () => {
      mockDb.db.delete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({}),
      });

      const result = await resolver.removeDependency('task-002', 'task-001');

      expect(result.isOk()).toBe(true);
    });
  });

  describe('getDependencies', () => {
    it('should return direct dependencies', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([
              { task_id: 'task-002', depends_on_task_id: 'task-001' },
              { task_id: 'task-002', depends_on_task_id: 'task-003' },
            ]),
          }),
        }),
      });

      const result = await resolver.getDependencies('task-002');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(['task-001', 'task-003']);
      }
    });

    it('should return empty array for no dependencies', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      const result = await resolver.getDependencies('task-002');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getDependents', () => {
    it('should return direct dependents', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([
              { task_id: 'task-002', depends_on_task_id: 'task-001' },
              { task_id: 'task-003', depends_on_task_id: 'task-001' },
            ]),
          }),
        }),
      });

      const result = await resolver.getDependents('task-001');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(['task-002', 'task-003']);
      }
    });
  });

  describe('areDependenciesMet', () => {
    it('should return true when no dependencies exist', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      const result = await resolver.areDependenciesMet('task-002');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it('should return true when all dependencies are in terminal states', async () => {
      // areDependenciesMet flow:
      // 1. getDependencies → select deps with .where().all()
      // 2. For each dep: select task with .where().get()
      const selectMock = vi.fn();

      // Call 1: getDependencies → returns dep list
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ depends_on_task_id: 'task-001' }]),
          }),
        }),
      });

      // Call 2: get dep task status (task-001 is MERGED — terminal)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks['task-001']),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await resolver.areDependenciesMet('task-002');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it('should return false when a dependency is not in terminal state', async () => {
      const selectMock = vi.fn();

      // Call 1: getDependencies
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ depends_on_task_id: 'task-002' }]),
          }),
        }),
      });

      // Call 2: task-002 is READY — not terminal
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTasks['task-002']),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await resolver.areDependenciesMet('task-003');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });

    it('should return error if dependency task not found', async () => {
      const selectMock = vi.fn();

      // Call 1: getDependencies
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([{ depends_on_task_id: 'nonexistent' }]),
          }),
        }),
      });

      // Call 2: dep task not found
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(undefined),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await resolver.areDependenciesMet('task-002');

      expect(result.isErr()).toBe(true);
    });
  });
});
