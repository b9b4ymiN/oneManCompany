/**
 * Tasks API Routes
 *
 * Endpoints for managing tasks.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { FlockDatabase, Task, Review, Gate } from '@onemancompany/flock-kernel';
import { eq, desc } from 'drizzle-orm';

// Use shared context type
export interface AppContext {
  db: FlockDatabase;
  basePath: string;
}

const tasks = new Hono<{ Variables: AppContext }>();

// Validation schemas
const createTaskSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  requires_review: z.boolean().default(true),
});

/**
 * Helper: Convert DB gate to domain gate
 */
function toGate(dbGate: {
  id: string;
  task_id: string;
  name: string;
  command: string;
  status: string;
  output_path: string | null;
  created_at: string;
}): Gate {
  return {
    id: dbGate.id,
    task_id: dbGate.task_id,
    name: dbGate.name,
    command: dbGate.command,
    status: dbGate.status as Gate['status'],
    output_path: dbGate.output_path || undefined,
    created_at: dbGate.created_at,
  };
}

/**
 * GET /api/tasks?projectId=&status=
 *
 * List tasks with filters.
 */
tasks.get('/', async (c) => {
  const db = c.get('db');
  const projectId = c.req.query('projectId');
  const status = c.req.query('status');

  let dbTasks;

  if (projectId) {
    dbTasks = await db.db
      .select()
      .from(db.schema.tasks)
      .where(eq(db.schema.tasks.project_id, projectId))
      .orderBy(desc(db.schema.tasks.created_at))
      .all();
  } else {
    dbTasks = await db.db
      .select()
      .from(db.schema.tasks)
      .orderBy(desc(db.schema.tasks.created_at))
      .all();
  }

  const tasks: Task[] = dbTasks
    .filter((t) => !status || t.status === status)
    .map((t) => ({
      id: t.id,
      project_id: t.project_id,
      title: t.title,
      description: t.description,
      status: t.status as Task['status'],
      priority: t.priority as Task['priority'],
      requires_review: t.requires_review,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));

  return c.json({ tasks });
});

/**
 * GET /api/tasks/:id
 *
 * Get task detail with runs, gates, and reviews.
 */
tasks.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const task = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, id))
    .get();

  if (!task) {
    return c.json({ error: 'Task not found', code: 'NOT_FOUND' }, 404);
  }

  // Get runs for this task
  const dbRuns = await db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.task_id, id))
    .orderBy(desc(db.schema.runs.started_at))
    .all();

  // Get gates for this task
  const dbGates = await db.db
    .select()
    .from(db.schema.gates)
    .where(eq(db.schema.gates.task_id, id))
    .orderBy(desc(db.schema.gates.created_at))
    .all();

  // Get reviews for this task
  const dbReviews = await db.db
    .select()
    .from(db.schema.reviews)
    .where(eq(db.schema.reviews.task_id, id))
    .orderBy(desc(db.schema.reviews.created_at))
    .all();

  const gates: Gate[] = dbGates.map(toGate);

  const reviews: Review[] = dbReviews.map((r) => ({
    id: r.id,
    task_id: r.task_id,
    reviewer: r.reviewer,
    verdict: r.verdict as Review['verdict'],
    comment: r.comment,
    created_at: r.created_at,
  }));

  return c.json({
    task: {
      id: task.id,
      project_id: task.project_id,
      title: task.title,
      description: task.description,
      status: task.status as Task['status'],
      priority: task.priority as Task['priority'],
      requires_review: task.requires_review,
      created_at: task.created_at,
      updated_at: task.updated_at,
    },
    runs: dbRuns,
    gates,
    reviews,
  });
});

/**
 * POST /api/tasks
 *
 * Create task.
 */
tasks.post('/', async (c) => {
  const db = c.get('db');

  const body = await c.req.json();
  const result = createTaskSchema.safeParse(body);

  if (!result.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: result.error.flatten(),
      },
      400
    );
  }

  const data = result.data;
  const now = new Date().toISOString();

  // Validate project exists
  const project = await db.db
    .select()
    .from(db.schema.projects)
    .where(eq(db.schema.projects.id, data.project_id))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);
  }

  // Count existing tasks for this project to generate ID
  const taskCount = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.project_id, data.project_id))
    .all().length;

  const taskId = `task-${String(taskCount + 1).padStart(3, '0')}`;

  try {
    await db.db.insert(db.schema.tasks).values({
      id: taskId,
      project_id: data.project_id,
      title: data.title,
      description: data.description,
      status: 'DRAFT',
      priority: data.priority,
      requires_review: data.requires_review,
      created_at: now,
      updated_at: now,
    });

    const task: Task = {
      id: taskId,
      project_id: data.project_id,
      title: data.title,
      description: data.description,
      status: 'DRAFT',
      priority: data.priority,
      requires_review: data.requires_review,
      created_at: now,
      updated_at: now,
    };

    return c.json({ task }, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create task',
        code: 'CREATE_FAILED',
      },
      500
    );
  }
});

/**
 * POST /api/tasks/:id/approve
 *
 * Approve task.
 */
tasks.post('/:id/approve', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json();
  const reviewer = body.reviewer || 'api-user';

  const task = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, id))
    .get();

  if (!task) {
    return c.json({ error: 'Task not found', code: 'NOT_FOUND' }, 404);
  }

  if (task.status !== 'REVIEW_REQUIRED' && task.status !== 'GATES_FAILED') {
    return c.json(
      {
        error: `Task is not ready for approval. Current state: ${task.status}`,
        code: 'INVALID_STATE',
      },
      400
    );
  }

  const now = new Date().toISOString();

  // Create review
  const reviewId = `review-${Date.now()}`;
  await db.db.insert(db.schema.reviews).values({
    id: reviewId,
    task_id: id,
    reviewer,
    verdict: 'APPROVE',
    comment: body.comment || 'Approved via API',
    created_at: now,
  });

  // Update task state to APPROVED
  await db.db
    .update(db.schema.tasks)
    .set({ status: 'APPROVED', updated_at: now })
    .where(eq(db.schema.tasks.id, id));

  return c.json({ success: true });
});

/**
 * POST /api/tasks/:id/reject
 *
 * Reject task.
 */
tasks.post('/:id/reject', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json();

  const task = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, id))
    .get();

  if (!task) {
    return c.json({ error: 'Task not found', code: 'NOT_FOUND' }, 404);
  }

  const now = new Date().toISOString();
  const reason = body.reason || 'Rejected via API';

  // Create review with REJECT verdict
  const reviewId = `review-${Date.now()}`;
  await db.db.insert(db.schema.reviews).values({
    id: reviewId,
    task_id: id,
    reviewer: 'api-user',
    verdict: 'REJECT',
    comment: reason,
    created_at: now,
  });

  // Update task state to REJECTED
  await db.db
    .update(db.schema.tasks)
    .set({ status: 'REJECTED', updated_at: now })
    .where(eq(db.schema.tasks.id, id));

  return c.json({ success: true });
});

/**
 * POST /api/tasks/:id/merge
 *
 * Merge task.
 */
tasks.post('/:id/merge', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const task = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, id))
    .get();

  if (!task) {
    return c.json({ error: 'Task not found', code: 'NOT_FOUND' }, 404);
  }

  if (task.status !== 'APPROVED') {
    return c.json(
      {
        error: `Task is not approved. Current state: ${task.status}`,
        code: 'INVALID_STATE',
      },
      400
    );
  }

  // Get project
  const project = await db.db
    .select()
    .from(db.schema.projects)
    .where(eq(db.schema.projects.id, task.project_id))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);
  }

  // Get the most recent run
  const run = await db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.task_id, id))
    .orderBy(desc(db.schema.runs.started_at))
    .limit(1)
    .get();

  if (!run) {
    return c.json({ error: 'No run found for task', code: 'NOT_FOUND' }, 404);
  }

  // Merge the branch using git
  try {
    const { execSync } = require('node:child_process');

    execSync(`git checkout ${project.default_branch}`, {
      cwd: project.repo_path,
      stdio: 'pipe',
    });

    execSync(`git merge ${run.branch_name} --no-ff`, {
      cwd: project.repo_path,
      stdio: 'pipe',
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to merge branch',
        code: 'MERGE_FAILED',
      },
      500
    );
  }

  // Update task state to MERGED
  const now = new Date().toISOString();
  await db.db
    .update(db.schema.tasks)
    .set({ status: 'MERGED', updated_at: now })
    .where(eq(db.schema.tasks.id, id));

  return c.json({ success: true });
});

export { tasks };
