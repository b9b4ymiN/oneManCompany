/**
 * Flock Diff Command
 *
 * Show diff for a task.
 */

import { resolve } from 'node:path';
import { createDatabase } from '@onemancompany/flock-kernel';
import { eq, and } from 'drizzle-orm';

/**
 * Show diff for a task.
 */
export async function diffCommand(taskId: string, options: { full: boolean }): Promise<void> {
  const dbPath = resolve(process.cwd(), '.flock', 'flock.db');
  const db = createDatabase(dbPath);

  // Get task
  const task = db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, taskId))
    .get();

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  // Get the most recent run for this task
  const run = db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.task_id, taskId))
    .orderBy(db.schema.runs.started_at)
    .all().pop();

  if (!run) {
    console.log(`No runs found for task ${taskId}`);
    return;
  }

  console.log(`Task: ${task.title} (${taskId})`);
  console.log(`Run: ${run.id}`);
  console.log(`Branch: ${run.branch_name}`);
  console.log(`Workspace: ${run.workspace_path}`);
  console.log('');

  // Use git to show diff
  const { execSync } = require('node:child_process');
  const cwd = run.workspace_path;

  try {
    if (options.full) {
      // Show full patch
      const diff = execSync('git diff HEAD', { cwd, encoding: 'utf-8' });
      console.log(diff);
    } else {
      // Show summary
      const stats = execSync('git diff --shortstat HEAD', { cwd, encoding: 'utf-8' });
      const files = execSync('git diff --name-status HEAD', { cwd, encoding: 'utf-8' });
      console.log('Summary:', stats.trim());
      console.log('');
      console.log('Files changed:');
      console.log(files);
    }
  } catch (error) {
    console.error(`Failed to get diff: ${error}`);
  }
}
