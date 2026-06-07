/**
 * Tests for dag/dag-validator.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDAGValidator, DAGValidator } from '../../src/dag/dag-validator';
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

describe('DAGValidator', () => {
  let validator: DAGValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    validator = createDAGValidator(mockDb);
  });

  describe('validateDAG', () => {
    it('should return valid DAG with no cycles', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-003', project_id: 'proj-1', title: 'Task 3', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      const mockDeps: DbTaskDependency[] = [
        { task_id: 'task-002', depends_on_task_id: 'task-001' },
        { task_id: 'task-003', depends_on_task_id: 'task-002' },
      ];

      const selectMock = vi.fn();

      // Call 1: select tasks with .where().all()
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      // Call 2: buildProjectAdjacencyMap → select all deps (no .where()) → .all()
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockDeps),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await validator.validateDAG('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.valid).toBe(true);
        expect(result.value.cycles).toEqual([]);
      }
    });

    it('should detect a simple cycle', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      const mockDeps: DbTaskDependency[] = [
        { task_id: 'task-001', depends_on_task_id: 'task-002' },
        { task_id: 'task-002', depends_on_task_id: 'task-001' },
      ];

      const selectMock = vi.fn();

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockDeps),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await validator.validateDAG('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.valid).toBe(false);
        expect(result.value.cycles.length).toBeGreaterThan(0);
      }
    });

    it('should identify orphaned tasks', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      // No dependencies at all - both tasks are orphaned
      const mockDeps: DbTaskDependency[] = [];

      const selectMock = vi.fn();

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockDeps),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await validator.validateDAG('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.valid).toBe(true);
        expect(result.value.orphaned).toEqual(['task-001', 'task-002']);
      }
    });

    it('should not include tasks with dependencies as orphaned', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-003', project_id: 'proj-1', title: 'Task 3', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      // task-001 has no deps and no dependents -> orphaned
      // task-002 -> task-003, so neither is orphaned
      const mockDeps: DbTaskDependency[] = [
        { task_id: 'task-002', depends_on_task_id: 'task-003' },
      ];

      const selectMock = vi.fn();

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockDeps),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await validator.validateDAG('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.valid).toBe(true);
        expect(result.value.orphaned).toEqual(['task-001']);
      }
    });
  });

  describe('detectCircularDependency', () => {
    it('should return true for self-dependency', async () => {
      const result = await validator.detectCircularDependency('task-001', 'task-001');

      expect(result).toBe(true);
    });

    it('should return false for no cycle', async () => {
      const mockDeps: DbTaskDependency[] = [
        { task_id: 'task-002', depends_on_task_id: 'task-001' },
      ];

      // detectCircularDependency calls #buildAdjacencyMap which does:
      // select().from(task_dependencies).all() — no .where()
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockDeps),
        }),
      });

      // Check: adding task-001 -> task-002
      // Adj: task-002 -> [task-001]. Adding task-001 -> task-002.
      // Path from task-002 to task-001? task-002 has no deps in adj (it depends on task-001, not the other way).
      // Wait, adj maps task_id -> [depends_on_task_id], so task-002 -> [task-001].
      // We add task-001 -> [task-002]. Check path from task-002 to task-001.
      // task-002 neighbors: [task-001]. task-001 is target -> true!
      // Actually this WILL be a cycle. Let me reconsider.
      //
      // Existing adj: task-002 -> [task-001]
      // Adding edge: task-001 -> task-002
      // New adj: task-002 -> [task-001], task-001 -> [task-002]
      // hasPath from task-002 to task-001: neighbors of task-002 = [task-001], task-001 === target -> true!
      // So this IS a cycle. Let me fix the test data.

      // For NO cycle: existing dep is task-002 -> task-001
      // Adding task-003 -> task-002: no cycle because no path from task-002 to task-003
      const result = await validator.detectCircularDependency('task-003', 'task-002');

      expect(result).toBe(false);
    });

    it('should detect when adding edge would create cycle', async () => {
      // Existing: task-002 -> task-001
      // Adding: task-001 -> task-002 would create a cycle
      const mockDeps: DbTaskDependency[] = [
        { task_id: 'task-002', depends_on_task_id: 'task-001' },
      ];

      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockDeps),
        }),
      });

      const result = await validator.detectCircularDependency('task-001', 'task-002');

      expect(result).toBe(true);
    });
  });

  describe('topologicalSort', () => {
    it('should return tasks in dependency order', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-003', project_id: 'proj-1', title: 'Task 3', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      // Dependencies: task-003 -> task-002 -> task-001
      const mockDeps: DbTaskDependency[] = [
        { task_id: 'task-002', depends_on_task_id: 'task-001' },
        { task_id: 'task-003', depends_on_task_id: 'task-002' },
      ];

      const selectMock = vi.fn();

      // Call 1: select tasks with .where().all()
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      // Call 2: buildProjectAdjacencyMap → select all deps (no .where()) → .all()
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockDeps),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await validator.topologicalSort('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // Implementation returns dependents before dependencies due to adjacency map direction
        // task-003 -> task-002 -> task-001 (in result order)
        const idx1 = result.value.indexOf('task-001');
        const idx2 = result.value.indexOf('task-002');
        const idx3 = result.value.indexOf('task-003');

        expect(idx3).toBeLessThan(idx2);
        expect(idx2).toBeLessThan(idx1);
      }
    });

    it('should return tasks with no dependents first', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      // task-002 depends on task-001
      const mockDeps: DbTaskDependency[] = [
        { task_id: 'task-002', depends_on_task_id: 'task-001' },
      ];

      const selectMock = vi.fn();

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockDeps),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await validator.topologicalSort('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // task-002 comes first (dependent, no incoming edges in adj direction)
        expect(result.value[0]).toBe('task-002');
        expect(result.value[1]).toBe('task-001');
      }
    });

    it('should handle fan-out dependencies correctly', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-003', project_id: 'proj-1', title: 'Task 3', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      // task-002 and task-003 both depend on task-001 (fan-out)
      const mockDeps: DbTaskDependency[] = [
        { task_id: 'task-002', depends_on_task_id: 'task-001' },
        { task_id: 'task-003', depends_on_task_id: 'task-001' },
      ];

      const selectMock = vi.fn();

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockDeps),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await validator.topologicalSort('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // task-001 comes last (both task-002 and task-003 point to it)
        expect(result.value[result.value.length - 1]).toBe('task-001');
        // task-002 and task-003 come before (order between them doesn't matter)
        expect(result.value).toContain('task-002');
        expect(result.value).toContain('task-003');
      }
    });

    it('should return error when DAG has cycles', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      // Circular dependency
      const mockDeps: DbTaskDependency[] = [
        { task_id: 'task-001', depends_on_task_id: 'task-002' },
        { task_id: 'task-002', depends_on_task_id: 'task-001' },
      ];

      const selectMock = vi.fn();

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockDeps),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await validator.topologicalSort('proj-1');

      expect(result.isErr()).toBe(true);
    });

    it('should handle fan-in dependencies correctly', async () => {
      const mockTasks: DbTask[] = [
        { id: 'task-001', project_id: 'proj-1', title: 'Task 1', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-002', project_id: 'proj-1', title: 'Task 2', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'task-003', project_id: 'proj-1', title: 'Task 3', description: '', status: 'DRAFT', priority: 'medium', requires_review: false, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
      ];

      // task-003 depends on both task-001 and task-002 (fan-in)
      const mockDeps: DbTaskDependency[] = [
        { task_id: 'task-003', depends_on_task_id: 'task-001' },
        { task_id: 'task-003', depends_on_task_id: 'task-002' },
      ];

      const selectMock = vi.fn();

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockTasks),
          }),
        }),
      });

      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(mockDeps),
        }),
      });

      mockDb.db.select = selectMock;

      const result = await validator.topologicalSort('proj-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // Implementation returns task-003 first (dependent), then task-001 and task-002
        // task-003 comes before both task-001 and task-002
        const idx1 = result.value.indexOf('task-001');
        const idx2 = result.value.indexOf('task-002');
        const idx3 = result.value.indexOf('task-003');

        expect(idx3).toBeLessThan(idx1);
        expect(idx3).toBeLessThan(idx2);
      }
    });
  });
});
