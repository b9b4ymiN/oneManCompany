/**
 * Diff API Routes
 *
 * Endpoints for diff viewing.
 */

import { Hono } from 'hono';
import type { FlockDatabase } from '@onemancompany/flock-kernel';
import { eq, desc } from 'drizzle-orm';
import { getBranchDiff } from '@onemancompany/flock-kernel';

// Use shared context type
export interface AppContext {
  db: FlockDatabase;
  basePath: string;
}

const diff = new Hono<{ Variables: AppContext }>();

/**
 * GET /api/diff/:taskId
 *
 * Get diff summary for task's workspace.
 */
diff.get('/:taskId', async (c) => {
  const db = c.get('db');
  const taskId = c.req.param('taskId');

  // Validate task exists
  const task = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, taskId))
    .get();

  if (!task) {
    return c.json({ error: 'Task not found', code: 'NOT_FOUND' }, 404);
  }

  // Get the most recent run
  const run = await db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.task_id, taskId))
    .orderBy(desc(db.schema.runs.started_at))
    .limit(1)
    .get();

  if (!run) {
    return c.json({ error: 'No run found for task', code: 'NOT_FOUND' }, 404);
  }

  // Get project to find repo path
  const project = await db.db
    .select()
    .from(db.schema.projects)
    .where(eq(db.schema.projects.id, task.project_id))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);
  }

  try {
    // Get diff using the branch manager's getBranchDiff function
    const diffResult = await getBranchDiff(project.repo_path, run.branch_name);

    if (diffResult.isErr()) {
      return c.json(
        {
          error: 'Failed to get diff',
          code: 'GIT_ERROR',
          details: diffResult.error.message,
        },
        500
      );
    }

    const summary = diffResult.value;

    return c.json({
      taskId,
      branchName: run.branch_name,
      baseBranch: project.default_branch,
      summary,
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get diff',
        code: 'DIFF_ERROR',
      },
      500
    );
  }
});

export { diff };
