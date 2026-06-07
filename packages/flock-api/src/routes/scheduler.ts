/**
 * Scheduler API Routes
 *
 * Endpoints for interacting with the parallel scheduler.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { FlockDatabase, Run } from '@onemancompany/flock-kernel';
import { eq, desc, inArray } from 'drizzle-orm';
import { createParallelScheduler } from '@onemancompany/flock-kernel';

export interface AppContext {
  db: FlockDatabase;
  basePath: string;
  config: any;
}

const scheduler = new Hono<{ Variables: AppContext }>();

// Validation schemas
const scheduleSchema = z.object({
  project_id: z.string().optional(),
});

/**
 * GET /api/scheduler/queue
 *
 * Get current queue status.
 */
scheduler.get('/queue', async (c) => {
  const db = c.get('db');
  const config = c.get('config');

  // Get max parallel runs from config
  const maxParallelRuns = config.policies?.max_parallel_runs || 3;

  // Get active runs
  const activeStates = ['SPAWNING', 'RUNNING', 'STOPPING'];
  const activeRuns = await db.db
    .select()
    .from(db.schema.runs)
    .where(inArray(db.schema.runs.status, activeStates as any))
    .all();

  // Get queued runs
  const queuedRuns = await db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.status, 'QUEUED'))
    .orderBy(desc(db.schema.runs.started_at))
    .all();

  const availableSlots = Math.max(0, maxParallelRuns - activeRuns.length);

  return c.json({
    queued: queuedRuns.map((r) => ({
      id: r.id,
      task_id: r.task_id,
      agent_id: r.agent_id,
      enqueued_at: r.started_at,
    })),
    running: activeRuns.map((r) => ({
      id: r.id,
      task_id: r.task_id,
      agent_id: r.agent_id,
      status: r.status,
      started_at: r.started_at,
    })),
    available_slots: availableSlots,
    max_parallel: maxParallelRuns,
  });
});

/**
 * POST /api/scheduler/schedule
 *
 * Trigger scheduling of next batch of queued runs.
 */
scheduler.post('/schedule', async (c) => {
  const db = c.get('db');
  const config = c.get('config');

  const schedulerInstance = createParallelScheduler(db, {
    maxParallelRuns: config.policies?.max_parallel_runs || 3,
  });

  const result = await schedulerInstance.scheduleNext();

  if (result.isErr()) {
    return c.json({ error: result.error.message }, 500);
  }

  return c.json({
    message: 'Scheduling complete',
    newly_started: result.value.length,
    runs: result.value.map((r) => ({
      id: r.id,
      task_id: r.task_id,
      agent_id: r.agent_id,
      status: r.status,
    })),
  });
});

/**
 * GET /api/scheduler/agents
 *
 * Get available agents and their workload.
 */
scheduler.get('/agents', async (c) => {
  const db = c.get('db');
  const config = c.get('config');

  const schedulerInstance = createParallelScheduler(db, {
    maxParallelRuns: config.policies?.max_parallel_runs || 3,
  });

  const result = await schedulerInstance.getAvailableAgents();

  if (result.isErr()) {
    return c.json({ error: result.error.message }, 500);
  }

  return c.json({
    agents: result.value.map((a) => ({
      id: a.id,
      config: a.config,
      active_runs: a.activeRuns,
    })),
  });
});

/**
 * GET /api/scheduler/agents/:agentId/workload
 *
 * Get workload for a specific agent.
 */
scheduler.get('/agents/:agentId/workload', async (c) => {
  const db = c.get('db');
  const agentId = c.req.param('agentId');

  const activeRuns = await db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.agent_id, agentId as string))
    .all();

  const activeCount = activeRuns.filter(
    (r) => r.status === 'SPAWNING' || r.status === 'RUNNING' || r.status === 'STOPPING'
  ).length;

  return c.json({
    agent_id: agentId,
    active_runs: activeCount,
    total_runs: activeRuns.length,
  });
});

export default scheduler;
