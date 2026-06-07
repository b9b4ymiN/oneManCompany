/**
 * Gates API Routes
 *
 * Endpoints for managing quality gates.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { FlockDatabase, Gate } from '@onemancompany/flock-kernel';
import { eq, desc } from 'drizzle-orm';

// Use shared context type
export interface AppContext {
  db: FlockDatabase;
  basePath: string;
}

const gates = new Hono<{ Variables: AppContext }>();

// Validation schemas
const runGatesSchema = z.object({
  task_id: z.string().min(1),
  workspace_path: z.string().min(1),
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
 * GET /api/gates?taskId=
 *
 * List gates for a task.
 */
gates.get('/', async (c) => {
  const db = c.get('db');
  const taskId = c.req.query('taskId');

  if (!taskId) {
    return c.json({ error: 'taskId query parameter is required', code: 'VALIDATION_ERROR' }, 400);
  }

  const dbGates = await db.db
    .select()
    .from(db.schema.gates)
    .where(eq(db.schema.gates.task_id, taskId))
    .orderBy(desc(db.schema.gates.created_at))
    .all();

  const gates: Gate[] = dbGates.map(toGate);

  return c.json({ gates });
});

/**
 * POST /api/gates/run
 *
 * Execute gates for a task.
 *
 * Note: This is a simplified version that updates gate records.
 * In a full implementation, this would integrate with the gate runner.
 */
gates.post('/run', async (c) => {
  const db = c.get('db');

  const body = await c.req.json();
  const result = runGatesSchema.safeParse(body);

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

  // Validate task exists
  const task = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, data.task_id))
    .get();

  if (!task) {
    return c.json({ error: 'Task not found', code: 'NOT_FOUND' }, 404);
  }

  // Get existing gates for this task
  const existingGates = await db.db
    .select()
    .from(db.schema.gates)
    .where(eq(db.schema.gates.task_id, data.task_id))
    .all();

  // In a full implementation, this would execute the actual gate commands
  // For now, we'll return the existing gates
  const now = new Date().toISOString();
  const gateResults: Gate[] = existingGates.map(toGate);

  // Update task state based on gate results
  const anyFailed = gateResults.some((g) => g.status === 'failed');
  const allPassed = gateResults.length > 0 && gateResults.every((g) => g.status === 'passed');

  if (allPassed) {
    await db.db
      .update(db.schema.tasks)
      .set({ status: 'REVIEW_REQUIRED', updated_at: now })
      .where(eq(db.schema.tasks.id, data.task_id));
  } else if (anyFailed) {
    await db.db
      .update(db.schema.tasks)
      .set({ status: 'GATES_FAILED', updated_at: now })
      .where(eq(db.schema.tasks.id, data.task_id));
  }

  return c.json({
    results: gateResults,
    summary: {
      total: gateResults.length,
      passed: gateResults.filter((g) => g.status === 'passed').length,
      failed: gateResults.filter((g) => g.status === 'failed').length,
      skipped: gateResults.filter((g) => g.status === 'skipped').length,
    },
  });
});

export { gates };
