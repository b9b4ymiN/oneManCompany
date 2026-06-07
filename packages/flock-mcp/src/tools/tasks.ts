/**
 * Task MCP Tools
 *
 * MCP tools for managing Flock tasks.
 */

import type { FlockDatabase } from '@onemancompany/flock-kernel';
import { tasks, task_dependencies } from '@onemancompany/flock-kernel';
import { eq, and, asc, desc } from 'drizzle-orm';
import { z } from 'zod';
import { toMCPResult, ToolSuccess, ToolError } from '../types.js';

// ============================================================================
// flock_task_create
// ============================================================================

export const TOOL_NAME_TASK_CREATE = 'flock_task_create';
export const TOOL_DESC_TASK_CREATE = 'Create a new task in a project';

export const flockTaskCreateSchema = z.object({
  projectId: z.string().describe('Project ID'),
  title: z.string().describe('Task title'),
  description: z.string().describe('Task description'),
  agentId: z.string().optional().describe('Agent ID to assign (optional)'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Task priority'),
  requiresReview: z.boolean().optional().describe('Whether review is required before merge'),
});

export interface FlockTaskCreateArgs {
  projectId: string;
  title: string;
  description: string;
  agentId?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  requiresReview?: boolean;
}

export async function flockTaskCreate(
  db: FlockDatabase,
  args: FlockTaskCreateArgs
): Promise<ToolSuccess> {
  const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();

  const newTask = {
    id,
    project_id: args.projectId,
    title: args.title,
    description: args.description,
    status: 'DRAFT' as const,
    priority: args.priority ?? 'medium',
    requires_review: args.requiresReview ?? false,
    created_at: now,
    updated_at: now,
  };

  await db.db.insert(tasks).values(newTask);

  return {
    success: true,
    data: {
      task: newTask,
    },
  };
}

// ============================================================================
// flock_task_list
// ============================================================================

export const TOOL_NAME_TASK_LIST = 'flock_task_list';
export const TOOL_DESC_TASK_LIST = 'List tasks with optional filters';

export const flockTaskListSchema = z.object({
  projectId: z.string().describe('Project ID to filter by'),
  status: z.string().optional().describe('Filter by task status'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by priority'),
});

export interface FlockTaskListArgs {
  projectId: string;
  status?: string;
  priority?: string;
}

export async function flockTaskList(
  db: FlockDatabase,
  args: FlockTaskListArgs
): Promise<ToolSuccess> {
  const conditions = [eq(tasks.project_id, args.projectId)];

  if (args.status) {
    conditions.push(eq(tasks.status, args.status));
  }

  if (args.priority) {
    conditions.push(eq(tasks.priority, args.priority));
  }

  const taskList = await db.db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.created_at));

  return {
    success: true,
    data: {
      tasks: taskList,
      count: taskList.length,
    },
  };
}

// ============================================================================
// flock_task_status
// ============================================================================

export const TOOL_NAME_TASK_STATUS = 'flock_task_status';
export const TOOL_DESC_TASK_STATUS = 'Get task details with runs, gates, and reviews';

export const flockTaskStatusSchema = z.object({
  taskId: z.string().describe('Task ID'),
});

export interface FlockTaskStatusArgs {
  taskId: string;
}

export async function flockTaskStatus(
  db: FlockDatabase,
  args: FlockTaskStatusArgs
): Promise<ToolSuccess | ToolError> {
  const taskList = await db.db.select().from(tasks).where(eq(tasks.id, args.taskId));

  if (taskList.length === 0) {
    return {
      success: false,
      error: `Task not found: ${args.taskId}`,
      code: 'TASK_NOT_FOUND',
    };
  }

  const task = taskList[0];

  // Get runs
  const { runs } = db.schema;
  const taskRuns = await db.db
    .select()
    .from(runs)
    .where(eq(runs.task_id, args.taskId))
    .orderBy(desc(runs.started_at));

  // Get gates
  const { gates } = db.schema;
  const taskGates = await db.db
    .select()
    .from(gates)
    .where(eq(gates.task_id, args.taskId))
    .orderBy(asc(gates.created_at));

  // Get reviews
  const { reviews } = db.schema;
  const taskReviews = await db.db
    .select()
    .from(reviews)
    .where(eq(reviews.task_id, args.taskId))
    .orderBy(desc(reviews.created_at));

  // Get dependencies
  const deps = await db.db
    .select()
    .from(task_dependencies)
    .where(eq(task_dependencies.task_id, args.taskId));

  const depIds = deps.map((d) => d.depends_on_task_id);

  return {
    success: true,
    data: {
      task,
      runs: taskRuns,
      gates: taskGates,
      reviews: taskReviews,
      dependencies: depIds,
    },
  };
}

// ============================================================================
// flock_task_update
// ============================================================================

export const TOOL_NAME_TASK_UPDATE = 'flock_task_update';
export const TOOL_DESC_TASK_UPDATE = 'Update task status or priority';

export const flockTaskUpdateSchema = z.object({
  taskId: z.string().describe('Task ID'),
  status: z.string().optional().describe('New task status'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('New priority'),
});

export interface FlockTaskUpdateArgs {
  taskId: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export async function flockTaskUpdate(
  db: FlockDatabase,
  args: FlockTaskUpdateArgs
): Promise<ToolSuccess | ToolError> {
  const taskList = await db.db.select().from(tasks).where(eq(tasks.id, args.taskId));

  if (taskList.length === 0) {
    return {
      success: false,
      error: `Task not found: ${args.taskId}`,
      code: 'TASK_NOT_FOUND',
    };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (args.status) {
    updates.status = args.status;
  }

  if (args.priority) {
    updates.priority = args.priority;
  }

  await db.db.update(tasks).set(updates).where(eq(tasks.id, args.taskId));

  const updatedTask = await db.db.select().from(tasks).where(eq(tasks.id, args.taskId));

  return {
    success: true,
    data: {
      task: updatedTask[0],
    },
  };
}

// ============================================================================
// flock_task_deps_add
// ============================================================================

export const TOOL_NAME_TASK_DEPS_ADD = 'flock_task_deps_add';
export const TOOL_DESC_TASK_DEPS_ADD = 'Add a dependency to a task';

export const flockTaskDepsAddSchema = z.object({
  taskId: z.string().describe('Task ID'),
  dependsOnTaskId: z.string().describe('Task ID that this task depends on'),
});

export interface FlockTaskDepsAddArgs {
  taskId: string;
  dependsOnTaskId: string;
}

export async function flockTaskDepsAdd(
  db: FlockDatabase,
  args: FlockTaskDepsAddArgs
): Promise<ToolSuccess | ToolError> {
  // Verify both tasks exist
  const taskList = await db.db.select().from(tasks).where(eq(tasks.id, args.taskId));
  const depList = await db.db.select().from(tasks).where(eq(tasks.id, args.dependsOnTaskId));

  if (taskList.length === 0) {
    return {
      success: false,
      error: `Task not found: ${args.taskId}`,
      code: 'TASK_NOT_FOUND',
    };
  }

  if (depList.length === 0) {
    return {
      success: false,
      error: `Dependency task not found: ${args.dependsOnTaskId}`,
      code: 'TASK_NOT_FOUND',
    };
  }

  // Check if dependency already exists
  const existing = await db.db
    .select()
    .from(task_dependencies)
    .where(
      and(
        eq(task_dependencies.task_id, args.taskId),
        eq(task_dependencies.depends_on_task_id, args.dependsOnTaskId)
      )
    );

  if (existing.length > 0) {
    return {
      success: true,
      data: {
        message: 'Dependency already exists',
        taskId: args.taskId,
        dependsOnTaskId: args.dependsOnTaskId,
      },
    };
  }

  // Add the dependency
  await db.db.insert(task_dependencies).values({
    task_id: args.taskId,
    depends_on_task_id: args.dependsOnTaskId,
  });

  return {
    success: true,
    data: {
      message: 'Dependency added',
      taskId: args.taskId,
      dependsOnTaskId: args.dependsOnTaskId,
    },
  };
}

// ============================================================================
// flock_task_deps_remove
// ============================================================================

export const TOOL_NAME_TASK_DEPS_REMOVE = 'flock_task_deps_remove';
export const TOOL_DESC_TASK_DEPS_REMOVE = 'Remove a dependency from a task';

export const flockTaskDepsRemoveSchema = z.object({
  taskId: z.string().describe('Task ID'),
  dependsOnTaskId: z.string().describe('Task ID to remove dependency on'),
});

export interface FlockTaskDepsRemoveArgs {
  taskId: string;
  dependsOnTaskId: string;
}

export async function flockTaskDepsRemove(
  db: FlockDatabase,
  args: FlockTaskDepsRemoveArgs
): Promise<ToolSuccess | ToolError> {
  const result = await db.db
    .delete(task_dependencies)
    .where(
      and(
        eq(task_dependencies.task_id, args.taskId),
        eq(task_dependencies.depends_on_task_id, args.dependsOnTaskId)
      )
    )
    .returning();

  if (result.length === 0) {
    return {
      success: false,
      error: 'Dependency not found',
      code: 'DEPENDENCY_NOT_FOUND',
    };
  }

  return {
    success: true,
    data: {
      message: 'Dependency removed',
      taskId: args.taskId,
      dependsOnTaskId: args.dependsOnTaskId,
    },
  };
}
