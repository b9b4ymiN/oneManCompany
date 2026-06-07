/**
 * Flock Reject Command
 *
 * Reject a task with optional reason.
 */

import { resolve } from 'node:path';
import { createDatabase, loadConfigSync } from '@onemancompany/flock-kernel';
import { eq } from 'drizzle-orm';
import { FlockOrchestrator } from '@onemancompany/flock-kernel';

/**
 * Reject a task.
 */
export async function rejectCommand(taskId: string, options: { reason?: string }): Promise<void> {
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
    .where(eq(db.schema.tasks.id, taskId))
    .get();

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  // Get reason or prompt
  let reason = options.reason;
  if (!reason) {
    const readline = require('node:readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    reason = await new Promise<string>((resolve) => {
      rl.question('Reason for rejection: ', resolve);
    });

    rl.close();
  }

  if (!reason) {
    console.error('A reason is required for rejection');
    process.exit(1);
  }

  // Create orchestrator and reject
  const orchestrator = new FlockOrchestrator(db, config);
  const result = await orchestrator.rejectTask(taskId, reason);

  if (result.isErr()) {
    console.error(`Failed to reject task: ${result.error.message}`);
    process.exit(1);
  }

  console.log(`✓ Task ${taskId} rejected`);
  console.log(`  Reason: ${reason}`);
  console.log(`  Status: ${result.value.status}`);
}
