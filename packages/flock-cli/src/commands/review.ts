/**
 * Flock Review Command
 *
 * Review a task and show summary, diff, gate results.
 */

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
    .where(eq(db.schema.tasks.id, taskId))
    .get();

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  // Get project
  const project = db.db
    .select()
    .from(db.schema.projects)
    .where(eq(db.schema.projects.id, task.project_id))
    .get();

  if (!project) {
    console.error(`Project not found: ${task.project_id}`);
    process.exit(1);
  }

  // Get runs
  const runs = db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.task_id, taskId))
    .orderBy(db.schema.runs.started_at)
    .all();

  // Get gates
  const gates = db.db
    .select()
    .from(db.schema.gates)
    .where(eq(db.schema.gates.task_id, taskId))
    .all();

  // Get reviews
  const reviews = db.db
    .select()
    .from(db.schema.reviews)
    .where(eq(db.schema.reviews.task_id, taskId))
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
