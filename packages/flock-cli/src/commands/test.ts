/**
 * Flock Test Command
 *
 * Run gates for a task.
 */

import { resolve } from 'node:path';
import { createDatabase, loadConfigSync } from '@onemancompany/flock-kernel';
import { eq } from 'drizzle-orm';
import { FlockOrchestrator } from '@onemancompany/flock-kernel';

/**
 * Run gates for a task.
 */
export async function testCommand(taskId: string): Promise<void> {
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

  // Get the most recent run for this task
  const run = db.db
    .select()
    .from(db.schema.runs)
    .where(eq(db.schema.runs.task_id, taskId))
    .orderBy(db.schema.runs.started_at)
    .all().pop();

  if (!run) {
    console.error(`No runs found for task ${taskId}`);
    process.exit(1);
  }

  console.log(`Running gates for task ${taskId}...`);
  console.log('');

  // Create orchestrator
  const orchestrator = new FlockOrchestrator(db, config);

  // Run gates
  const result = await orchestrator.runGates(taskId, run.workspace_path);

  if (result.isErr()) {
    console.error(`Failed to run gates: ${result.error.message}`);
    process.exit(1);
  }

  const gateResults = result.value;

  // Display results
  for (const gate of gateResults) {
    const icon = gate.status === 'passed' ? '✓' : gate.status === 'failed' ? '✗' : '⊘';
    console.log(`${icon} ${gate.gate}: ${gate.status} (${gate.duration_ms}ms)`);
    if (gate.logPath) {
      console.log(`  Log: ${gate.logPath}`);
    }
    if (gate.summary) {
      console.log(`  ${gate.summary}`);
    }
  }

  console.log('');

  const allPassed = gateResults.every((g) => g.status === 'passed' || g.status === 'skipped');
  if (allPassed) {
    console.log('All gates passed!');
  } else {
    console.log('Some gates failed.');
    process.exit(1);
  }
}
