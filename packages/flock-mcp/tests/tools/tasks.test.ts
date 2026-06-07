/**
 * Tests for Task MCP tools
 */

import { describe, it, expect } from 'vitest';
import {
  flockTaskCreateSchema,
  flockTaskListSchema,
  flockTaskStatusSchema,
  flockTaskUpdateSchema,
  flockTaskDepsAddSchema,
  flockTaskDepsRemoveSchema,
} from '../../src/tools/tasks';

describe('Task Tools - Schema Validation', () => {
  describe('flockTaskCreateSchema', () => {
    it('should accept valid input with all fields', () => {
      const validInput = {
        projectId: 'proj-1',
        title: 'New Task',
        description: 'Task description',
        agentId: 'claude-code',
        priority: 'high',
        requiresReview: true,
      };
      const result = flockTaskCreateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept input with only required fields', () => {
      const validInput = {
        projectId: 'proj-1',
        title: 'New Task',
        description: 'Task description',
      };
      const result = flockTaskCreateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject missing projectId', () => {
      const invalidInput = {
        title: 'New Task',
        description: 'Task description',
      };
      const result = flockTaskCreateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject missing title', () => {
      const invalidInput = {
        projectId: 'proj-1',
        description: 'Task description',
      };
      const result = flockTaskCreateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate priority enum', () => {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      for (const priority of validPriorities) {
        const input = {
          projectId: 'proj-1',
          title: 'Task',
          description: 'Desc',
          priority,
        };
        const result = flockTaskCreateSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid priority', () => {
      const invalidInput = {
        projectId: 'proj-1',
        title: 'Task',
        description: 'Desc',
        priority: 'invalid',
      };
      const result = flockTaskCreateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('flockTaskListSchema', () => {
    it('should accept input with only projectId', () => {
      const validInput = { projectId: 'proj-1' };
      const result = flockTaskListSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept input with status filter', () => {
      const validInput = {
        projectId: 'proj-1',
        status: 'READY',
      };
      const result = flockTaskListSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept input with priority filter', () => {
      const validInput = {
        projectId: 'proj-1',
        priority: 'high',
      };
      const result = flockTaskListSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept input with all filters', () => {
      const validInput = {
        projectId: 'proj-1',
        status: 'READY',
        priority: 'high',
      };
      const result = flockTaskListSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject missing projectId', () => {
      const invalidInput = {
        status: 'READY',
      };
      const result = flockTaskListSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate priority enum', () => {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      for (const priority of validPriorities) {
        const input = {
          projectId: 'proj-1',
          priority,
        };
        const result = flockTaskListSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('flockTaskStatusSchema', () => {
    it('should accept valid input', () => {
      const validInput = { taskId: 'task-001' };
      const result = flockTaskStatusSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject missing taskId', () => {
      const invalidInput = {};
      const result = flockTaskStatusSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject non-string taskId', () => {
      const invalidInput = { taskId: 123 };
      const result = flockTaskStatusSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('flockTaskUpdateSchema', () => {
    it('should accept input with status', () => {
      const validInput = {
        taskId: 'task-001',
        status: 'IN_PROGRESS',
      };
      const result = flockTaskUpdateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept input with priority', () => {
      const validInput = {
        taskId: 'task-001',
        priority: 'high',
      };
      const result = flockTaskUpdateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept input with both status and priority', () => {
      const validInput = {
        taskId: 'task-001',
        status: 'IN_PROGRESS',
        priority: 'high',
      };
      const result = flockTaskUpdateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept input with only taskId (both fields optional)', () => {
      const validInput = { taskId: 'task-001' };
      const result = flockTaskUpdateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject missing taskId', () => {
      const invalidInput = {
        status: 'IN_PROGRESS',
      };
      const result = flockTaskUpdateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate priority enum', () => {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      for (const priority of validPriorities) {
        const input = {
          taskId: 'task-001',
          priority,
        };
        const result = flockTaskUpdateSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('flockTaskDepsAddSchema', () => {
    it('should accept valid input', () => {
      const validInput = {
        taskId: 'task-001',
        dependsOnTaskId: 'task-002',
      };
      const result = flockTaskDepsAddSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject missing taskId', () => {
      const invalidInput = {
        dependsOnTaskId: 'task-002',
      };
      const result = flockTaskDepsAddSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject missing dependsOnTaskId', () => {
      const invalidInput = {
        taskId: 'task-001',
      };
      const result = flockTaskDepsAddSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('flockTaskDepsRemoveSchema', () => {
    it('should accept valid input', () => {
      const validInput = {
        taskId: 'task-001',
        dependsOnTaskId: 'task-002',
      };
      const result = flockTaskDepsRemoveSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject missing taskId', () => {
      const invalidInput = {
        dependsOnTaskId: 'task-002',
      };
      const result = flockTaskDepsRemoveSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject missing dependsOnTaskId', () => {
      const invalidInput = {
        taskId: 'task-001',
      };
      const result = flockTaskDepsRemoveSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });
});

describe('Task Tools - Tool Registration', () => {
  it('should export all tool names', async () => {
    const {
      TOOL_NAME_TASK_CREATE,
      TOOL_NAME_TASK_LIST,
      TOOL_NAME_TASK_STATUS,
      TOOL_NAME_TASK_UPDATE,
      TOOL_NAME_TASK_DEPS_ADD,
      TOOL_NAME_TASK_DEPS_REMOVE,
    } = await import('../../src/tools/tasks');

    expect(TOOL_NAME_TASK_CREATE).toBe('flock_task_create');
    expect(TOOL_NAME_TASK_LIST).toBe('flock_task_list');
    expect(TOOL_NAME_TASK_STATUS).toBe('flock_task_status');
    expect(TOOL_NAME_TASK_UPDATE).toBe('flock_task_update');
    expect(TOOL_NAME_TASK_DEPS_ADD).toBe('flock_task_deps_add');
    expect(TOOL_NAME_TASK_DEPS_REMOVE).toBe('flock_task_deps_remove');
  });

  it('should export all tool descriptions', async () => {
    const {
      TOOL_DESC_TASK_CREATE,
      TOOL_DESC_TASK_LIST,
      TOOL_DESC_TASK_STATUS,
      TOOL_DESC_TASK_UPDATE,
      TOOL_DESC_TASK_DEPS_ADD,
      TOOL_DESC_TASK_DEPS_REMOVE,
    } = await import('../../src/tools/tasks');

    expect(typeof TOOL_DESC_TASK_CREATE).toBe('string');
    expect(typeof TOOL_DESC_TASK_LIST).toBe('string');
    expect(typeof TOOL_DESC_TASK_STATUS).toBe('string');
    expect(typeof TOOL_DESC_TASK_UPDATE).toBe('string');
    expect(typeof TOOL_DESC_TASK_DEPS_ADD).toBe('string');
    expect(typeof TOOL_DESC_TASK_DEPS_REMOVE).toBe('string');
  });

  it('should export all tool functions', async () => {
    const {
      flockTaskCreate,
      flockTaskList,
      flockTaskStatus,
      flockTaskUpdate,
      flockTaskDepsAdd,
      flockTaskDepsRemove,
    } = await import('../../src/tools/tasks');

    expect(typeof flockTaskCreate).toBe('function');
    expect(typeof flockTaskList).toBe('function');
    expect(typeof flockTaskStatus).toBe('function');
    expect(typeof flockTaskUpdate).toBe('function');
    expect(typeof flockTaskDepsAdd).toBe('function');
    expect(typeof flockTaskDepsRemove).toBe('function');
  });
});
