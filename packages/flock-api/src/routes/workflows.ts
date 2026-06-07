/**
 * Workflows API Routes
 *
 * Endpoints for executing workflow patterns.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { FlockDatabase, Task, SequentialChain, ParallelFanOut, FanIn, ReviewPipeline } from '@onemancompany/flock-kernel';
import { eq } from 'drizzle-orm';
import { createWorkflowRunner } from '@onemancompany/flock-kernel';

export interface AppContext {
  db: FlockDatabase;
  basePath: string;
}

const workflows = new Hono<{ Variables: AppContext }>();

// Validation schemas
const sequentialSchema = z.object({
  project_id: z.string().min(1),
  tasks: z.array(
    z.object({
      title: z.string().min(1),
      agent_id: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    })
  ),
});

const parallelSchema = z.object({
  project_id: z.string().min(1),
  source_task: z.object({
    title: z.string().min(1),
    agent_id: z.string().min(1),
    description: z.string().optional(),
  }),
  targets: z.array(
    z.object({
      title: z.string().min(1),
      agent_id: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    })
  ),
});

const fanInSchema = z.object({
  project_id: z.string().min(1),
  source_tasks: z.array(
    z.object({
      title: z.string().min(1),
      agent_id: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    })
  ),
  target: z.object({
    title: z.string().min(1),
    agent_id: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  }),
});

const reviewPipelineSchema = z.object({
  project_id: z.string().min(1),
  implement: z.object({
    agent_id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  }),
  test: z.object({
    agent_id: z.string().min(1),
    description: z.string().optional(),
  }),
  review: z.object({
    agent_id: z.string().min(1),
    required_approvals: z.number().optional().default(1),
    auto_reject_threshold: z.number().optional().default(2),
  }),
});

/**
 * POST /api/workflows/sequential
 *
 * Execute a sequential chain workflow.
 */
workflows.post('/sequential', async (c) => {
  const db = c.get('db');

  const body = await c.req.json();
  const parsed = sequentialSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error }, 400);
  }

  const { project_id, tasks } = parsed.data;

  // Verify project exists
  const project = await db.db
    .select()
    .from(db.schema.projects)
    .where(eq(db.schema.projects.id, project_id))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Create workflow runner and execute
  const workflowRunner = createWorkflowRunner(db);

  const chain: SequentialChain = {
    tasks: tasks.map((t) => ({
      title: t.title,
      agentId: t.agent_id,
      description: t.description,
      priority: t.priority,
    })),
  };
  const result = await workflowRunner.executeSequentialChain(chain, {
    projectId: project_id,
    autoStart: false,
    queueEnabled: true,
  });

  if (result.isErr()) {
    return c.json({ error: result.error.message }, 500);
  }

  return c.json({
    message: 'Sequential workflow created',
    workflow_type: 'sequential',
    project_id,
    task_ids: result.value.taskIds,
    tasks: result.value.tasks,
  });
});

/**
 * POST /api/workflows/parallel
 *
 * Execute a parallel fan-out workflow.
 */
workflows.post('/parallel', async (c) => {
  const db = c.get('db');

  const body = await c.req.json();
  const parsed = parallelSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error }, 400);
  }

  const { project_id, source_task, targets } = parsed.data;

  // Verify project exists
  const project = await db.db
    .select()
    .from(db.schema.projects)
    .where(eq(db.schema.projects.id, project_id))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Create workflow runner and execute
  const workflowRunner = createWorkflowRunner(db);

  const fanOut: ParallelFanOut = {
    sourceTask: {
      title: source_task.title,
      agentId: source_task.agent_id,
      description: source_task.description,
    },
    targets: targets.map((t) => ({
      title: t.title,
      agentId: t.agent_id,
      description: t.description,
      priority: t.priority,
    })),
  };

  const result = await workflowRunner.executeParallelFanOut(fanOut, {
    projectId: project_id,
    autoStart: false,
    queueEnabled: true,
  });

  if (result.isErr()) {
    return c.json({ error: result.error.message }, 500);
  }

  return c.json({
    message: 'Parallel fan-out workflow created',
    workflow_type: 'parallel-fan-out',
    project_id,
    task_ids: result.value.taskIds,
    tasks: result.value.tasks,
  });
});

/**
 * POST /api/workflows/fan-in
 *
 * Execute a fan-in workflow.
 */
workflows.post('/fan-in', async (c) => {
  const db = c.get('db');

  const body = await c.req.json();
  const parsed = fanInSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error }, 400);
  }

  const { project_id, source_tasks, target } = parsed.data;

  // Verify project exists
  const project = await db.db
    .select()
    .from(db.schema.projects)
    .where(eq(db.schema.projects.id, project_id))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Create workflow runner and execute
  const workflowRunner = createWorkflowRunner(db);

  const fanIn: FanIn = {
    sourceTasks: source_tasks.map((t) => ({
      title: t.title,
      agentId: t.agent_id,
      description: t.description,
      priority: t.priority,
    })),
    target: {
      title: target.title,
      agentId: target.agent_id,
      description: target.description,
      priority: target.priority,
    },
  };

  const result = await workflowRunner.executeFanIn(fanIn, {
    projectId: project_id,
    autoStart: false,
    queueEnabled: true,
  });

  if (result.isErr()) {
    return c.json({ error: result.error.message }, 500);
  }

  return c.json({
    message: 'Fan-in workflow created',
    workflow_type: 'fan-in',
    project_id,
    task_ids: result.value.taskIds,
    tasks: result.value.tasks,
  });
});

/**
 * POST /api/workflows/review-pipeline
 *
 * Execute a review pipeline workflow.
 */
workflows.post('/review-pipeline', async (c) => {
  const db = c.get('db');

  const body = await c.req.json();
  const parsed = reviewPipelineSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error }, 400);
  }

  const { project_id, implement, test, review } = parsed.data;

  // Verify project exists
  const project = await db.db
    .select()
    .from(db.schema.projects)
    .where(eq(db.schema.projects.id, project_id))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Create workflow runner and execute
  const workflowRunner = createWorkflowRunner(db);

  const pipeline: ReviewPipeline = {
    implement: {
      agentId: implement.agent_id,
      title: implement.title,
      description: implement.description,
      priority: implement.priority,
    },
    test: {
      agentId: test.agent_id,
      description: test.description,
    },
    review: {
      agentId: review.agent_id,
      requiredApprovals: review.required_approvals,
      autoRejectThreshold: review.auto_reject_threshold,
    },
  };

  const result = await workflowRunner.executeReviewPipeline(pipeline, {
    projectId: project_id,
    autoStart: false,
    queueEnabled: true,
  });

  if (result.isErr()) {
    return c.json({ error: result.error.message }, 500);
  }

  return c.json({
    message: 'Review pipeline workflow created',
    workflow_type: 'review-pipeline',
    project_id,
    task_ids: result.value.taskIds,
    tasks: result.value.tasks,
    review_config: {
      reviewer_agent: review.agent_id,
      required_approvals: review.required_approvals,
      auto_reject_threshold: review.auto_reject_threshold,
    },
  });
});

export default workflows;
