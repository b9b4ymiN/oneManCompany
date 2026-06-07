/**
 * Runs API Routes
 *
 * Endpoints for managing agent runs.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { FlockDatabase } from '@onemancompany/flock-kernel';
import { eq, desc } from 'drizzle-orm';

// Use shared context type
export interface AppContext {
  db: FlockDatabase;
  basePath: string;
}

const runs = new Hono<{ Variables: AppContext }>();

// Validation schemas
const createRunSchema = z.object({
  task_id: z.string().min(1),
  agent_id: z.string().min(1),
});

/**
 * GET /api/runs?taskId=
 *
 * List runs for a task.
 */
runs.get('/', async (c) => {
  const db = c.get('db');
  const taskId = c.req.query('taskId');

  if (!taskId) {
    return c.json({ error: 'taskId query parameter is required', code: 'VALIDATION_ERROR' }, 400);
  }

  const dbRuns = await db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.task_id, taskId))
    .orderBy(desc(db.schema.runs.started_at))
    .all();

  return c.json({ runs: dbRuns });
});

/**
 * GET /api/runs/:id
 *
 * Get run detail with events.
 */
runs.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const run = await db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.id, id))
    .get();

  if (!run) {
    return c.json({ error: 'Run not found', code: 'NOT_FOUND' }, 404);
  }

  // Get events for this run
  const dbEvents = await db.db
    .select()
    .from(db.schema.events)
    .where(eq(db.schema.events.run_id, id))
    .orderBy(desc(db.schema.events.created_at))
    .all();

  const events = dbEvents.map((e) => ({
    id: e.id,
    run_id: e.run_id,
    type: e.type,
    payload: JSON.parse(e.payload_json),
    created_at: e.created_at,
  }));

  return c.json({
    run,
    events,
  });
});

/**
 * POST /api/runs
 *
 * Start a new run (spawn agent).
 *
 * Note: This is a simplified version that creates the run record.
 * In a full implementation, this would integrate with the orchestrator
 * to spawn the actual agent process.
 */
runs.post('/', async (c) => {
  const db = c.get('db');

  const body = await c.req.json();
  const result = createRunSchema.safeParse(body);

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

  // Validate task exists
  const task = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, data.task_id))
    .get();

  if (!task) {
    return c.json({ error: 'Task not found', code: 'NOT_FOUND' }, 404);
  }

  // Validate task state
  if (task.status !== 'READY' && task.status !== 'DRAFT') {
    return c.json(
      {
        error: `Task is not ready to run. Current state: ${task.status}`,
        code: 'INVALID_STATE',
      },
      400
    );
  }

  // Validate agent exists
  const agent = await db.db
    .select()
    .from(db.schema.agents)
    .where(eq(db.schema.agents.id, data.agent_id))
    .get();

  if (!agent) {
    return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
  }

  // Generate run ID
  const runId = `run-${Date.now()}`;
  const workspacePath = `/tmp/flock-workspaces/${data.task_id}/${data.agent_id}`;
  const branchName = `flock/${data.task_id}/${data.agent_id}`;

  try {
    // Create run record
    await db.db.insert(db.schema.runs).values({
      id: runId,
      task_id: data.task_id,
      agent_id: data.agent_id,
      workspace_path: workspacePath,
      branch_name: branchName,
      status: 'QUEUED',
      started_at: now,
    });

    // Update task state to RUNNING
    await db.db
      .update(db.schema.tasks)
      .set({ status: 'RUNNING', updated_at: now })
      .where(eq(db.schema.tasks.id, data.task_id));

    const run = await db.db
      .select()
      .from(db.schema.runs)
      .where(eq(db.schema.runs.id, runId))
      .get();

    if (!run) {
      return c.json({ error: 'Failed to create run', code: 'CREATE_FAILED' }, 500);
    }

    return c.json({ run }, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create run',
        code: 'CREATE_FAILED',
      },
      500
    );
  }
});

export { runs };
