import { safeEq, safeDesc } from '../drizzle-helpers';
/**
 * Flock Merge Command
 *
 * Merge a task's changes into the default branch.
 */

import { resolve } from 'node:path';
import { createDatabase, loadConfigSync } from '@onemancompany/flock-kernel';
import { eq } from 'drizzle-orm';
import { FlockOrchestrator } from '@onemancompany/flock-kernel';

/**
 * Merge a task.
 */
export async function mergeCommand(taskId: string, options: { preserve: boolean }): Promise<void> {
  const dbPath = resolve(process.cwd(), '.flock', 'flock.db');
  const db = createDatabase(dbPath);

  // Load config
  const configResult = loadConfigSync();
  if (configResult.isErr()) {
    console.error(`Failed to load config: ${configResult.error.message}`);
    process.exit(1);
  }
  const config = configResult.value;

  // Verify task exists and is approved
  const task = db.db
    .select()
    .from(db.schema.tasks)
    .where(safeEq(db.schema.tasks, "id", taskId))
    .get();

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  if (task.status !== 'APPROVED') {
    console.error(`Task is not approved. Current status: ${task.status}`);
    console.error('Only approved tasks can be merged.');
    process.exit(1);
  }

  console.log(`Merging task ${taskId}...`);

  // Create orchestrator and merge
  const orchestrator = new FlockOrchestrator(db, config);
  const result = await orchestrator.mergeTask(taskId, options.preserve);

  if (result.isErr()) {
    console.error(`Failed to merge task: ${result.error.message}`);
    process.exit(1);
  }

  console.log(`✓ Task ${taskId} merged successfully`);
  console.log(`  Status: ${result.value.status}`);

  if (!options.preserve) {
    console.log('  Workspace cleaned up');
  } else {
    console.log('  Workspace preserved for inspection');
  }
}
