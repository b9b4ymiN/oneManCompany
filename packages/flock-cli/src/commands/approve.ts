import { safeEq, safeDesc } from '../drizzle-helpers';
/**
 * Flock Approve Command
 *
 * Quick approve a task (no interactive prompt).
 */

import { resolve } from 'node:path';
import { createDatabase, loadConfigSync } from '@onemancompany/flock-kernel';
import { eq } from 'drizzle-orm';
import { FlockOrchestrator } from '@onemancompany/flock-kernel';

/**
 * Quick approve a task.
 */
export async function approveCommand(taskId: string): Promise<void> {
  const dbPath = resolve(process.cwd(), '.flock', 'flock.db');
  const db = createDatabase(dbPath);

  // Load config
  const configResult = loadConfigSync();
  if (configResult.isErr()) {
    console.error(`Failed to load config: ${configResult.error.message}`);
    process.exit(1);
  }
  const config = configResult.value;

  // Verify task exists
  const task = db.db
    .select()
    .from(db.schema.tasks)
    .where(safeEq(db.schema.tasks, "id", taskId))
    .get();

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  // Create orchestrator and approve
  const orchestrator = new FlockOrchestrator(db, config);
  const result = await orchestrator.approveTask(taskId, 'cli-user');

  if (result.isErr()) {
    console.error(`Failed to approve task: ${result.error.message}`);
    process.exit(1);
  }

  console.log(`✓ Task ${taskId} approved`);
  console.log(`  Status: ${result.value.status}`);
  console.log('');
  console.log('Ready to merge with: flock merge', taskId);
}
