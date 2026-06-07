/**
 * Flock List Command
 *
 * List all tasks with status, agents, and gates.
 */

import { resolve } from 'node:path';
import { createDatabase } from '@onemancompany/flock-kernel';
import { desc, eq } from 'drizzle-orm';

/**
 * Status icons for different states.
 */
const STATUS_ICONS: Record<string, string> = {
  DRAFT: '📝',
  READY: '✅',
  RUNNING: '🏃',
  AGENT_DONE: '🤖',
  GATES_RUNNING: '🚦',
  GATES_FAILED: '❌',
  REVIEW_REQUIRED: '👀',
  APPROVED: '✅',
  MERGED: '🎉',
  REJECTED: '🚫',
  ARCHIVED: '📦',
};

/**
 * List all tasks with details.
 */
export async function listCommand(): Promise<void> {
  const dbPath = resolve(process.cwd(), '.flock', 'flock.db');
  const db = createDatabase(dbPath);

  const tasks = db.db
    .select()
    .from(db.schema.tasks)
    .orderBy(desc(db.schema.tasks.updated_at))
    .all();

  if (tasks.length === 0) {
    console.log('No tasks found.');
    return;
  }

  console.log('Tasks:');
  console.log('');

  for (const task of tasks) {
    const icon = STATUS_ICONS[task.status] || '❓';

    // Get the most recent run for this task
    const run = db.db
      .select()
      .from(db.schema.runs)
      .where(eq(db.schema.runs.task_id, task.id))
      .orderBy(desc(db.schema.runs.started_at))
      .limit(1)
      .get();

    // Get gate results
    const gates = db.db
      .select()
      .from(db.schema.gates)
      .where(eq(db.schema.gates.task_id, task.id))
      .all();

    // Get reviews
    const reviews = db.db
      .select()
      .from(db.schema.reviews)
      .where(eq(db.schema.reviews.task_id, task.id))
      .all();

    // Build gate summary
    let gateSummary = '';
    if (gates.length > 0) {
      const passed = gates.filter((g) => g.status === 'passed').length;
      const failed = gates.filter((g) => g.status === 'failed').length;
      const skipped = gates.filter((g) => g.status === 'skipped').length;
      gateSummary = `Gates: ${passed}✓ ${failed}✗ ${skipped}⊘`;
    } else {
      gateSummary = 'Gates: none';
    }

    // Build agent info
    let agentInfo = 'Agent: none';
    if (run) {
      agentInfo = `Agent: ${run.agent_id} (${run.status})`;
    }

    // Build review info
    let reviewInfo = '';
    if (reviews.length > 0) {
      const latestReview = reviews[reviews.length - 1];
      reviewInfo = ` | Review: ${latestReview.verdict} by ${latestReview.reviewer}`;
    }

    console.log(`${icon} ${task.id}: ${task.title}`);
    console.log(`    Status: ${task.status} | Priority: ${task.priority}`);
    console.log(`    ${agentInfo} | ${gateSummary}${reviewInfo}`);
    console.log('');
  }
}
