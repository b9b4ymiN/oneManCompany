/**
 * Dependencies API Routes
 *
 * Endpoints for managing task dependencies.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { FlockDatabase } from '@onemancompany/flock-kernel';
import { eq, and, inArray } from 'drizzle-orm';

export interface AppContext {
  db: FlockDatabase;
  basePath: string;
}

const dependencies = new Hono<{ Variables: AppContext }>();

// Validation schemas
const addDependencySchema = z.object({
  depends_on_task_id: z.string().min(1),
});

/**
 * GET /api/tasks/:id/dependencies
 *
 * Get all dependencies for a task.
 */
dependencies.get('/', async (c) => {
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

  // Get dependencies
  const deps = await db.db
    .select()
    .from(db.schema.task_dependencies)
    .where(eq(db.schema.task_dependencies.task_id, taskId as string))
    .all();

  // Fetch dependent task details
  const dependentTasks = await Promise.all(
    deps.map(async (dep) => {
      const depTask = await db.db
        .select()
        .from(db.schema.tasks)
        .where(eq(db.schema.tasks.id, dep.depends_on_task_id))
        .get();

      return depTask
        ? {
            task_id: dep.task_id,
            depends_on_task_id: dep.depends_on_task_id,
            title: depTask.title,
            status: depTask.status,
          }
        : null;
    })
  );

  return c.json({
    dependencies: dependentTasks.filter((t) => t !== null),
  });
});

/**
 * POST /api/tasks/:id/dependencies
 *
 * Add a dependency to a task.
 */
dependencies.post('/', async (c) => {
  const db = c.get('db');
  const taskId = c.req.param('id');

  const body = await c.req.json();
  const parsed = addDependencySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error }, 400);
  }

  const { depends_on_task_id } = parsed.data;

  // Verify both tasks exist
  const [task, dependsOnTask] = await Promise.all([
    db.db.select().from(db.schema.tasks).where(eq(db.schema.tasks.id, taskId as string)).get(),
    db.db
      .select()
      .from(db.schema.tasks)
      .where(eq(db.schema.tasks.id, depends_on_task_id))
      .get(),
  ]);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  if (!dependsOnTask) {
    return c.json({ error: 'Dependency task not found' }, 404);
  }

  // Check for circular dependency
  const wouldCreateCycle = await checkCircularDependency(db, taskId as string, depends_on_task_id);
  if (wouldCreateCycle) {
    return c.json(
      {
        error: 'Circular dependency detected',
        message: `Adding dependency would create a cycle: ${taskId} -> ${depends_on_task_id}`,
      },
      400
    );
  }

  // Check if dependency already exists
  const existing = await db.db
    .select()
    .from(db.schema.task_dependencies)
    .where(
      and(
        eq(db.schema.task_dependencies.task_id, taskId as string),
        eq(db.schema.task_dependencies.depends_on_task_id, depends_on_task_id)
      )
    )
    .get();

  if (existing) {
    return c.json(
      {
        error: 'Dependency already exists',
        task_id: taskId,
        depends_on_task_id: depends_on_task_id,
      },
      409
    );
  }

  // Add the dependency
  await db.db.insert(db.schema.task_dependencies).values({
    task_id: taskId as string,
    depends_on_task_id,
  });

  return c.json({
    message: 'Dependency added',
    task_id: taskId,
    depends_on_task_id: depends_on_task_id,
  });
});

/**
 * DELETE /api/tasks/:id/dependencies/:dependsOnId
 *
 * Remove a dependency from a task.
 */
dependencies.delete('/:dependsOnId', async (c) => {
  const db = c.get('db');
  const taskId = c.req.param('id');
  const dependsOnId = c.req.param('dependsOnId');

  const result = await db.db
    .delete(db.schema.task_dependencies)
    .where(
      and(
        eq(db.schema.task_dependencies.task_id, taskId as string),
        eq(db.schema.task_dependencies.depends_on_task_id, dependsOnId as string)
      )
    );

  if (result.changes === 0) {
    return c.json({ error: 'Dependency not found' }, 404);
  }

  return c.json({
    message: 'Dependency removed',
    task_id: taskId,
    depends_on_task_id: dependsOnId,
  });
});

/**
 * GET /api/projects/:id/dag
 *
 * Get the full DAG (dependency graph) for a project.
 */
dependencies.get('/projects/:projectId/dag', async (c) => {
  const db = c.get('db');
  const projectId = c.req.param('projectId');

  // Verify project exists
  const project = await db.db
    .select()
    .from(db.schema.projects)
    .where(eq(db.schema.projects.id, projectId as string))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Get all tasks for the project
  const tasks = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.project_id, projectId as string))
    .all();

  // Get all dependencies for these tasks
  const allDeps = await db.db
    .select()
    .from(db.schema.task_dependencies)
    .where(
      inArray(
        db.schema.task_dependencies.task_id,
        tasks.map((t: any) => t.id)
      )
    )
    .all();

  // Build DAG representation
  const dag = {
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
    })),
    edges: allDeps.map((d) => ({
      from: d.depends_on_task_id,
      to: d.task_id,
    })),
  };

  return c.json(dag);
});

/**
 * Check if adding a dependency would create a cycle.
 */
async function checkCircularDependency(
  db: FlockDatabase,
  taskId: string,
  dependsOnTaskId: string
): Promise<boolean> {
  // Build adjacency map
  const adj = new Map<string, string[]>();
  const allDeps = await db.db.select().from(db.schema.task_dependencies).all();

  for (const dep of allDeps) {
    if (!adj.has(dep.task_id)) {
      adj.set(dep.task_id, []);
    }
    adj.get(dep.task_id)!.push(dep.depends_on_task_id);
  }

  // Add the new edge
  if (!adj.has(taskId)) {
    adj.set(taskId, []);
  }
  adj.get(taskId)!.push(dependsOnTaskId);

  // Check if there's a path from dependsOnTaskId back to taskId
  return hasPath(adj, dependsOnTaskId, taskId, new Set());
}

/**
 * DFS-based path detection.
 */
function hasPath(
  adj: Map<string, string[]>,
  start: string,
  target: string,
  visited: Set<string>
): boolean {
  if (start === target) {
    return true;
  }

  if (visited.has(start)) {
    return false;
  }

  visited.add(start);

  const neighbors = adj.get(start) || [];
  for (const neighbor of neighbors) {
    if (hasPath(adj, neighbor, target, visited)) {
      return true;
    }
  }

  return false;
}

export default dependencies;
