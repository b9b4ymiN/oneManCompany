import { safeEq, safeDesc } from '../drizzle-helpers';
/**
 * Flock Status Command
 *
 * Show task status or all tasks.
 */

import { resolve } from 'node:path';
import { createDatabase } from '@onemancompany/flock-kernel';
import { eq, desc, like } from 'drizzle-orm';

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
 * Show task status or list all tasks.
 */
export async function statusCommand(taskId?: string): Promise<void> {
  const dbPath = resolve(process.cwd(), '.flock', 'flock.db');
  const db = createDatabase(dbPath);

  if (taskId) {
    // Show single task detail
    const task = db.db
      .select()
      .from(db.schema.tasks)
      .where(safeEq(db.schema.tasks, "id", taskId))
      .get();

    if (!task) {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }

    // Get project
    const project = db.db
      .select()
      .from(db.schema.projects)
      .where(safeEq(db.schema.projects, "id", task.project_id))
      .get();

    // Get runs
    const runs = db.db
      .select()
      .from(db.schema.runs)
      .where(safeEq(db.schema.runs, "task_id", taskId))
      .orderBy(db.schema.runs.started_at)
      .all();

    // Get gates
    const gates = db.db
      .select()
      .from(db.schema.gates)
      .where(safeEq(db.schema.gates, "task_id", taskId))
      .all();

    // Get reviews
    const reviews = db.db
      .select()
      .from(db.schema.reviews)
      .where(safeEq(db.schema.reviews, "task_id", taskId))
      .orderBy(db.schema.reviews.created_at)
      .all();

    // Display task detail
    const icon = STATUS_ICONS[task.status] || '❓';
    console.log(`${icon} Task: ${task.title} (${taskId})`);
    console.log('');
    console.log(`Status: ${task.status}`);
    console.log(`Priority: ${task.priority}`);
    console.log(`Requires review: ${task.requires_review ? 'yes' : 'no'}`);
    if (project) {
      console.log(`Project: ${project.name}`);
    }
    console.log(`Created: ${task.created_at}`);
    console.log(`Updated: ${task.updated_at}`);
    console.log(`Description: ${task.description || 'No description'}`);
    console.log('');

    // Show runs
    console.log('Runs:');
    if (runs.length === 0) {
      console.log('  No runs yet');
    } else {
      for (const run of runs) {
        console.log(`  ${run.id}: ${run.status} - ${run.agent_id}`);
        console.log(`    Workspace: ${run.workspace_path}`);
        console.log(`    Branch: ${run.branch_name}`);
      }
    }
    console.log('');

    // Show gates
    console.log('Gates:');
    if (gates.length === 0) {
      console.log('  No gates run yet');
    } else {
      for (const gate of gates) {
        const gateIcon = gate.status === 'passed' ? '✓' : gate.status === 'failed' ? '✗' : '⊘';
        console.log(`  ${gateIcon} ${gate.name}: ${gate.status}`);
      }
    }
    console.log('');

    // Show reviews
    console.log('Reviews:');
    if (reviews.length === 0) {
      console.log('  No reviews yet');
    } else {
      for (const review of reviews) {
        console.log(`  ${review.reviewer}: ${review.verdict}`);
        console.log(`    ${review.comment}`);
      }
    }
  } else {
    // Show all tasks
    const tasks = db.db
      .select()
      .from(db.schema.tasks)
      .orderBy(safeDesc(db.schema.tasks, "updated_at"))
      .all();

    if (tasks.length === 0) {
      console.log('No tasks found.');
      return;
    }

    console.log('Tasks:');
    console.log('');

    for (const task of tasks) {
      const icon = STATUS_ICONS[task.status] || '❓';
      console.log(`${icon} ${task.id}: ${task.title}`);
      console.log(`    Status: ${task.status} | Priority: ${task.priority}`);
      console.log(`    Updated: ${task.updated_at}`);
      console.log('');
    }
  }
}
