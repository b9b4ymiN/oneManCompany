/**
 * Flock Task Retry Commands
 *
 * Retry management for failed tasks in the Flock system.
 */

import { Command } from 'commander';
import { resolve } from 'node:path';
import { createDatabase } from '@onemancompany/flock-kernel';
import { safeEq, safeDesc } from '../drizzle-helpers';

/**
 * Find the Flock database path.
 */
function findFlockDbPath(): string {
  return resolve(process.cwd(), '.flock', 'flock.db');
}

/**
 * Retry a failed task action.
 */
function retryTaskAction(taskId: string, options: { agent?: string }): void {
  const db = createDatabase(findFlockDbPath());

  // Verify task exists
  const task = db.db.select().from(db.schema.tasks).where(safeEq(db.schema.tasks, 'id', taskId)).get();

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  // Check if task can be retried (must be in a retryable state)
  const retryableStates = ['READY', 'GATES_FAILED', 'REJECTED'];
  if (!retryableStates.includes(task.status)) {
    console.error(`Task is not in a retryable state. Current state: ${task.status}`);
    console.error(`Retryable states: ${retryableStates.join(', ')}`);
    process.exit(1);
  }

  // Get recent runs for this task
  const runs = db.db
    .select()
    .from(db.schema.runs)
    .where(safeEq(db.schema.runs, 'task_id', taskId))
    .orderBy(safeDesc(db.schema.runs, 'started_at'))
    .limit(5)
    .all();

  if (runs.length === 0) {
    console.error(`No runs found for task: ${taskId}`);
    process.exit(1);
  }

  // Check if we've exceeded max retries
  const maxRetries = 3;
  if (runs.length >= maxRetries) {
    console.error(`Maximum retry count (${maxRetries}) exceeded for task: ${taskId}`);
    console.log(`Run history:`);
    for (const run of runs) {
      console.log(`  - ${run.id}: ${run.status} (exit: ${run.exit_code ?? 'N/A'})`);
    }
    process.exit(1);
  }

  // Determine agent to use
  const agentId = options.agent || runs[0].agent_id;

  // Update task state to READY for retry
  db.db
    .update(db.schema.tasks)
    .set({ status: 'READY', updated_at: new Date().toISOString() })
    .where(safeEq(db.schema.tasks, 'id', taskId))
    .run();

  console.log(`✓ Task ${taskId} is now ready to retry with agent: ${agentId}`);
  console.log(`  Previous attempts: ${runs.length}`);
  console.log(`  Run: flock task run ${taskId} --agent ${agentId}`);
}

/**
 * Show retry history for a task.
 */
function retryHistoryAction(taskId: string): void {
  const db = createDatabase(findFlockDbPath());

  const task = db.db.select().from(db.schema.tasks).where(safeEq(db.schema.tasks, 'id', taskId)).get();

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  const runs = db.db
    .select()
    .from(db.schema.runs)
    .where(safeEq(db.schema.runs, 'task_id', taskId))
    .orderBy(safeDesc(db.schema.runs, 'started_at'))
    .all();

  if (runs.length === 0) {
    console.log(`Task ${taskId} has no run history.`);
    return;
  }

  console.log(`Retry history for ${taskId}: ${task.title}`);
  console.log();

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const attemptNum = runs.length - i;
    const statusIcon = getRunStatusIcon(run.status as any);

    console.log(`Attempt ${attemptNum}: ${run.id}`);
    console.log(`  ${statusIcon} Status: ${run.status}`);
    console.log(`  Agent: ${run.agent_id}`);
    console.log(`  Started: ${run.started_at}`);
    if (run.ended_at) {
      console.log(`  Ended: ${run.ended_at}`);
    }
    if (run.exit_code !== null) {
      console.log(`  Exit code: ${run.exit_code}`);
    }
    if (run.workspace_path) {
      console.log(`  Workspace: ${run.workspace_path}`);
    }
    console.log();
  }

  // Show retry policy info
  const maxRetries = 3;
  const remainingRetries = Math.max(0, maxRetries - runs.length);
  console.log(`Retries remaining: ${remainingRetries} / ${maxRetries}`);
}

/**
 * Get run status icon.
 */
function getRunStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    QUEUED: '⏳',
    SPAWNING: '🔄',
    RUNNING: '▶️',
    STOPPING: '⏹️',
    COMPLETED: '✓',
    FAILED: '✗',
    TIMEOUT: '⏱️',
  };
  return icons[status] || '❓';
}

/**
 * Export retry commands.
 */
export const retryCommands = [
  new Command('retry')
    .description('Retry a failed task')
    .argument('<taskId>', 'Task ID to retry')
    .option('-a, --agent <agentId>', 'Agent to use for retry (default: previous agent)')
    .action(retryTaskAction),

  new Command('retry-policy')
    .description('Show retry history for a task')
    .argument('<taskId>', 'Task ID')
    .action(retryHistoryAction),
];
