import { safeEq, safeDesc } from '../drizzle-helpers';
/**
 * Flock Review Command
 *
 * Review a task and show summary, diff, gate results.
 */

import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createDatabase, loadConfigSync } from '@onemancompany/flock-kernel';
import { eq, and } from 'drizzle-orm';
import { createGateRunner } from '@onemancompany/flock-kernel';
import { FlockOrchestrator } from '@onemancompany/flock-kernel';
import * as readline from 'node:readline';

/**
 * Show task summary, diff, gate results and prompt for verdict.
 */
export async function reviewCommand(taskId: string): Promise<void> {
  const dbPath = resolve(process.cwd(), '.flock', 'flock.db');
  const db = createDatabase(dbPath);

  // Load config
  const configResult = loadConfigSync();
  if (configResult.isErr()) {
    console.error(`Failed to load config: ${configResult.error.message}`);
    process.exit(1);
  }
  const config = configResult.value;

  // Get task
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

  if (!project) {
    console.error(`Project not found: ${task.project_id}`);
    process.exit(1);
  }

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

  // Display summary
  console.log('=== Task Review ===');
  console.log('');
  console.log(`Task: ${task.title} (${taskId})`);
  console.log(`Status: ${task.status}`);
  console.log(`Priority: ${task.priority}`);
  console.log(`Project: ${project.name}`);
  console.log(`Description: ${task.description || 'No description'}`);
  console.log('');

  // Display runs
  console.log('Runs:');
  if (runs.length === 0) {
    console.log('  No runs yet');
  } else {
    for (const run of runs) {
      console.log(`  ${run.id}: ${run.status} - ${run.agent_id}`);
    }
  }
  console.log('');

  // Display gate results
  console.log('Gates:');
  if (gates.length === 0) {
    console.log('  No gates run yet');
  } else {
    for (const gate of gates) {
      const icon = gate.status === 'passed' ? '✓' : gate.status === 'failed' ? '✗' : '⊘';
      console.log(`  ${icon} ${gate.name}: ${gate.status}`);
    }
  }
  console.log('');

  // Display existing reviews
  if (reviews.length > 0) {
    console.log('Previous Reviews:');
    for (const review of reviews) {
      console.log(`  ${review.reviewer}: ${review.verdict}`);
      console.log(`    ${review.comment}`);
    }
    console.log('');
  }

  // Prompt for verdict
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log('Enter your verdict:');
  console.log('  1. approve');
  console.log('  2. request-changes');
  console.log('  3. reject');
  console.log('');

  const choice = await question('Choose [1-3]: ');
  const comment = await question('Comment: ');

  rl.close();

  let verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';
  switch (choice.trim()) {
    case '1':
      verdict = 'APPROVE';
      break;
    case '2':
      verdict = 'REQUEST_CHANGES';
      break;
    case '3':
      verdict = 'REJECT';
      break;
    default:
      console.error('Invalid choice');
      process.exit(1);
  }

  // Create orchestrator and record review
  const orchestrator = new FlockOrchestrator(db, config);
  const result = await orchestrator.recordReview(taskId, 'user', verdict, comment);

  if (result.isErr()) {
    console.error(`Failed to record review: ${result.error.message}`);
    process.exit(1);
  }

  console.log(`Review recorded: ${verdict}`);

  if (verdict === 'APPROVE') {
    console.log('Task approved. Ready to merge with: flock merge', taskId);
  }
}

/**
 * Assign reviewer action.
 */
function assignReviewerAction(taskId: string, options: { agent: string }): void {
  const db = createDatabase(findFlockDbPath());

  const task = db.db.select().from(db.schema.tasks).where(safeEq(db.schema.tasks, 'id', taskId)).get();

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  // Create reviewer assignment (recorded as an auto-review request)
  const reviewId = randomUUID();
  const now = new Date().toISOString();

  (db.db.insert(db.schema.reviews).values as any)({
    id: reviewId,
    task_id: taskId,
    reviewer: options.agent,
    verdict: 'ASK_ANOTHER_AGENT',
    comment: 'Auto-assigned for review',
    created_at: now,
  }).run();

  console.log(`✓ Reviewer assigned: ${options.agent} -> ${taskId}`);
  console.log(`  Review ID: ${reviewId}`);
}

/**
 * List reviews action.
 */
function listReviewsAction(taskId: string): void {
  const db = createDatabase(findFlockDbPath());

  const task = db.db.select().from(db.schema.tasks).where(safeEq(db.schema.tasks, 'id', taskId)).get();

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  const reviews = db.db
    .select()
    .from(db.schema.reviews)
    .where(safeEq(db.schema.reviews, 'task_id', taskId))
    .orderBy(db.schema.reviews.created_at)
    .all();

  if (reviews.length === 0) {
    console.log(`Task ${taskId} has no reviews.`);
    return;
  }

  console.log(`Reviews for ${taskId}: ${task.title}`);
  console.log();

  // Count consensus
  const approvals = reviews.filter((r) => r.verdict === 'APPROVE').length;
  const rejections = reviews.filter((r) => r.verdict === 'REJECT').length;
  const pending = reviews.filter((r) => r.verdict === 'ASK_ANOTHER_AGENT' || r.verdict === 'REQUEST_CHANGES').length;

  for (const review of reviews) {
    const icon = getVerdictIcon(review.verdict);
    console.log(`  ${icon} ${review.reviewer}: ${review.verdict}`);
    console.log(`    ${review.comment}`);
    console.log(`    ${review.created_at}`);
  }

  console.log();
  console.log(`Consensus:`);
  console.log(`  Approvals: ${approvals}`);
  console.log(`  Rejections: ${rejections}`);
  console.log(`  Pending: ${pending}`);

  if (approvals > rejections) {
    console.log(`  Status: ✓ Leaning towards approval`);
  } else if (rejections > approvals) {
    console.log(`  Status: ✗ Leaning towards rejection`);
  } else {
    console.log(`  Status: ⊘ No consensus yet`);
  }
}

/**
 * Get verdict icon.
 */
function getVerdictIcon(verdict: string): string {
  const icons: Record<string, string> = {
    APPROVE: '✓',
    REJECT: '✗',
    REQUEST_CHANGES: '↩️',
    ASK_ANOTHER_AGENT: '👀',
  };
  return icons[verdict] || '❓';
}

/**
 * Find the Flock database path.
 */
function findFlockDbPath(): string {
  return resolve(process.cwd(), '.flock', 'flock.db');
}

/**
 * Export reviewer commands.
 */
export const reviewerCommands = [
  new Command('assign-reviewer')
    .description('Assign a reviewer agent to a task')
    .argument('<taskId>', 'Task ID')
    .option('-a, --agent <agentId>', 'Reviewer agent ID')
    .requiredOption('-a, --agent <agentId>', 'Reviewer agent ID')
    .action(assignReviewerAction),

  new Command('reviews')
    .description('List all reviews for a task with consensus status')
    .argument('<taskId>', 'Task ID')
    .action(listReviewsAction),
];

