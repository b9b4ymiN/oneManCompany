/**
 * Retry API Routes
 *
 * Endpoints for managing task retries.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { FlockDatabase, Run, RetryPolicy } from '@onemancompany/flock-kernel';
import { eq, desc } from 'drizzle-orm';
import { createRetryEngine, createEventLogger } from '@onemancompany/flock-kernel';
import { resolve } from 'node:path';

export interface AppContext {
  db: FlockDatabase;
  basePath: string;
  config: any;
}

const retry = new Hono<{ Variables: AppContext }>();

// Validation schemas
const manualRetrySchema = z.object({
  agent_id: z.string().optional(),
});

/**
 * GET /api/tasks/:id/retries
 *
 * Get retry history for a task.
 */
retry.get('/', async (c) => {
  const db = c.get('db');
  const taskId = c.req.param('id');

  // Verify task exists
  const task = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, taskId as string))
    .get();

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  // Get all runs for the task (ordered by start time)
  const runs = await db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.task_id, taskId as string))
    .orderBy(desc(db.schema.runs.started_at))
    .all();

  // Build retry history from runs
  const retryHistory = runs.map((run, index) => {
    const attemptNumber = runs.length - index;
    let reason = 'Initial run';

    if (index > 0) {
      const previousRun = runs[index - 1];
      if (previousRun && previousRun.exit_code !== 0) {
        reason = 'Retry after failure';
      } else if (previousRun && previousRun.status === 'TIMEOUT') {
        reason = 'Retry after timeout';
      }
    }

    return {
      attempt: attemptNumber,
      run_id: run.id,
      agent_id: run.agent_id,
      status: run.status,
      started_at: run.started_at,
      ended_at: run.ended_at || null,
      exit_code: run.exit_code || null,
      reason,
    };
  });

  return c.json({
    task_id: taskId,
    total_attempts: runs.length,
    retries: retryHistory,
  });
});

/**
 * POST /api/tasks/:id/retry
 *
 * Trigger a manual retry for a task.
 */
retry.post('/', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  const taskId = c.req.param('id');

  const body = await c.req.json();
  const parsed = manualRetrySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error }, 400);
  }

  // Verify task exists and is in retryable state
  const task = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, taskId as string))
    .get();

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const retryableStates = ['READY', 'GATES_FAILED', 'REJECTED'];
  if (!retryableStates.includes(task.status)) {
    return c.json(
      {
        error: 'Task not in retryable state',
        current_status: task.status,
        retryable_states: retryableStates,
      },
      400
    );
  }

  // Get retry policy from config
  const retryPolicy: RetryPolicy = config.retry || {
    maxRetries: 3,
    retryOnGateFailure: true,
    retryOnAgentCrash: true,
    backoffMultiplier: 2,
    initialDelayMs: 1000,
  };

  // Create retry engine
  const eventLogger = createEventLogger(db, resolve(process.cwd(), '.flock'));
  const retryEngine = createRetryEngine(db, eventLogger);

  // Check if we should retry
  const mostRecentRun = await db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.task_id, taskId as string))
    .orderBy(desc(db.schema.runs.started_at))
    .limit(1)
    .get();

  if (mostRecentRun) {
    const shouldEscalate = await retryEngine.shouldEscalate(taskId as string, retryPolicy);

    if (shouldEscalate) {
      return c.json(
        {
          error: 'Maximum retry count exceeded',
          task_id: taskId,
          max_retries: retryPolicy.maxRetries,
        },
        400
      );
    }
  }

  // Execute retry
  const result = await retryEngine.executeRetry(taskId as string, retryPolicy);

  if (result.isErr()) {
    return c.json({ error: result.error.message }, 500);
  }

  return c.json({
    message: 'Retry queued',
    task_id: taskId,
    run_id: result.value.id,
    agent_id: result.value.agent_id,
    status: result.value.status,
  });
});

/**
 * GET /api/tasks/:id/retry-status
 *
 * Check if a task can be retried and how many retries remain.
 */
retry.get('/status', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  const taskId = c.req.param('id');

  // Verify task exists
  const task = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, taskId as string))
    .get();

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  // Get retry policy
  const retryPolicy: RetryPolicy = config.retry || {
    maxRetries: 3,
    retryOnGateFailure: true,
    retryOnAgentCrash: true,
    backoffMultiplier: 2,
    initialDelayMs: 1000,
  };

  // Count attempts
  const attemptCount = await db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.task_id, taskId as string))
    .all().length;

  const remainingRetries = Math.max(0, retryPolicy.maxRetries - attemptCount);
  const canRetry = remainingRetries > 0;

  return c.json({
    task_id: taskId,
    can_retry: canRetry,
    attempts_made: attemptCount,
    max_retries: retryPolicy.maxRetries,
    remaining_retries: remainingRetries,
  });
});

export default retry;
