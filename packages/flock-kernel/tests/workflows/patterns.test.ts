/**
 * Tests for workflows/patterns.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, err } from 'neverthrow';
import { createWorkflowRunner, WorkflowRunner } from '../../src/workflows/workflow-runner';
import type { FlockDatabase, DbTask, DbProject } from '../../src/db/client';

// Mock database helpers
function createSelectChain(responses: Array<{ method: 'get' | 'all'; value: any }>) {
  let callIndex = 0;
  return () => {
    const response = responses[Math.min(callIndex++, responses.length - 1)];
    const chain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: response.method === 'get' ? vi.fn().mockResolvedValue(response.value) : undefined,
          all: response.method === 'all' ? vi.fn().mockResolvedValue(response.value) : undefined,
        }),
      }),
    };
    return chain;
  };
}

const mockProject: DbProject = {
  id: 'proj-1',
  name: 'Test Project',
  repo_path: '/tmp/repo',
  default_branch: 'main',
  created_at: '2024-01-01T00:00:00.000Z',
};

// Mock database
function createMockDb(selectResponses: Array<{ method: 'get' | 'all'; value: any }>) {
  const selectFactory = createSelectChain(selectResponses);
  return {
    db: {
      select: vi.fn(selectFactory),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          run: vi.fn(),
        }),
      }),
      update: vi.fn(),
    },
    schema: {
      projects: {} as any,
      tasks: {} as any,
      task_dependencies: {} as any,
    },
    sqlite: {} as any,
  } as unknown as FlockDatabase;
}

describe('WorkflowRunner', () => {
  // TODO: Fix mock chains for sync Drizzle queries
  describe.skip('executeSequentialChain', () => {
    it('should create tasks with dependency chain', async () => {
      const mockDb = createMockDb([
        // #1: project check (get)
        { method: 'get', value: mockProject },
        // #2: task count (all) for task 1
        { method: 'all', value: [] },
        // #3: task count (all) for task 2
        { method: 'all', value: [] },
        // #4: task count (all) for task 3
        { method: 'all', value: [] },
      ]);

      const workflowRunner = createWorkflowRunner(mockDb);

      const chain = {
        tasks: [
          { title: 'Task 1', agentId: 'agent-1' },
          { title: 'Task 2', agentId: 'agent-2' },
          { title: 'Task 3', agentId: 'agent-3' },
        ],
      };

      const result = await workflowRunner.executeSequentialChain(chain, {
        projectId: 'proj-1',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.taskIds).toHaveLength(3);
        expect(result.value.status).toBe('created');
      }
    });
  });

  // TODO: Fix mock chains for sync Drizzle queries
  describe.skip('executeParallelFanOut', () => {
    it('should create source task and parallel targets', async () => {
      const mockDb = createMockDb([
        // #1: project check (get)
        { method: 'get', value: mockProject },
        // #2: task count for source task (all)
        { method: 'all', value: [] },
        // #3: get source task back (get)
        { method: 'get', value: { id: 'task-001', title: 'Source Task', status: 'DRAFT' } },
        // #4: task count for target 1 (all)
        { method: 'all', value: [] },
        // #5: task count for target 2 (all)
        { method: 'all', value: [] },
      ]);

      const workflowRunner = createWorkflowRunner(mockDb);

      const fanOut = {
        sourceTask: {
          title: 'Source Task',
          agentId: 'agent-1',
        },
        targets: [
          { title: 'Target 1', agentId: 'agent-2' },
          { title: 'Target 2', agentId: 'agent-3' },
        ],
      };

      const result = await workflowRunner.executeParallelFanOut(fanOut, {
        projectId: 'proj-1',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.taskIds).toHaveLength(3);
        expect(result.value.status).toBe('created');
      }
    });
  });

  // TODO: Fix mock chains for sync Drizzle queries
  describe.skip('executeFanIn', () => {
    it('should create source tasks and fan-in target', async () => {
      const mockDb = createMockDb([
        // #1: project check (get)
        { method: 'get', value: mockProject },
        // #2: task count for source 1 (all)
        { method: 'all', value: [] },
        // #3: task count for source 2 (all)
        { method: 'all', value: [] },
        // #4: get source task 1 back (get)
        { method: 'get', value: { id: 'task-001', title: 'Source 1', status: 'DRAFT' } },
        // #5: get source task 2 back (get)
        { method: 'get', value: { id: 'task-002', title: 'Source 2', status: 'DRAFT' } },
        // #6: task count for fan-in target (all)
        { method: 'all', value: [] },
      ]);

      const workflowRunner = createWorkflowRunner(mockDb);

      const fanIn = {
        sourceTasks: [
          { title: 'Source 1', agentId: 'agent-1' },
          { title: 'Source 2', agentId: 'agent-2' },
        ],
        target: {
          title: 'Fan-in Task',
          agentId: 'agent-3',
        },
      };

      const result = await workflowRunner.executeFanIn(fanIn, {
        projectId: 'proj-1',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.taskIds).toHaveLength(3);
        expect(result.value.status).toBe('created');
      }
    });
  });

  // TODO: Fix mock chains for sync Drizzle queries
  describe.skip('executeReviewPipeline', () => {
    it('should create implement and test tasks with review gate', async () => {
      const mockDb = createMockDb([
        // #1: project check (get)
        { method: 'get', value: mockProject },
        // #2: task count for implement task (all)
        { method: 'all', value: [] },
        // #3: get implement task back (get)
        { method: 'get', value: { id: 'task-001', title: 'Implement feature', status: 'DRAFT' } },
        // #4: task count for test task (all)
        { method: 'all', value: [] },
      ]);

      const workflowRunner = createWorkflowRunner(mockDb);

      const pipeline = {
        implement: {
          agentId: 'agent-1',
          title: 'Implement feature',
          description: 'Add new feature',
        },
        test: {
          agentId: 'agent-2',
          description: 'Test the feature',
        },
        review: {
          agentId: 'agent-3',
          requiredApprovals: 1,
        },
      };

      const result = await workflowRunner.executeReviewPipeline(pipeline, {
        projectId: 'proj-1',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.taskIds).toHaveLength(2);
        expect(result.value.status).toBe('created');
      }
    });
  });

  // TODO: Fix mock chains for sync Drizzle queries
  describe.skip('error handling', () => {
    it('should return partial success on target creation failure', async () => {
      const mockDb = createMockDb([
        // #1: project check (get)
        { method: 'get', value: mockProject },
        // #2: task count for source (all)
        { method: 'all', value: [] },
        // #3: get source task back (get)
        { method: 'get', value: { id: 'task-001', title: 'Source Task', status: 'DRAFT' } },
        // #4: task count for target (all)
        { method: 'all', value: [] },
      ]);

      const workflowRunner = createWorkflowRunner(mockDb);

      const fanOut = {
        sourceTask: {
          title: 'Source Task',
          agentId: 'agent-1',
        },
        targets: [
          { title: 'Target 1', agentId: 'agent-2' },
        ],
      };

      const result = await workflowRunner.executeParallelFanOut(fanOut, {
        projectId: 'proj-1',
      });

      // Should return successfully with created tasks
      expect(result.isOk()).toBe(true);
    });
  });
});
