import { safeEq, safeDesc } from '../drizzle-helpers';
/**
 * Flock Run Command
 *
 * Execute a task with an agent.
 */

import { resolve } from 'node:path';
import { createDatabase, loadConfigSync } from '@onemancompany/flock-kernel';
import { eq } from 'drizzle-orm';
import { createAgentSpawner, type AgentSpawner } from '@onemancompany/flock-kernel';
import { FlockOrchestrator } from '@onemancompany/flock-kernel';

/**
 * Run a task with an agent.
 */
export async function runCommand(
  taskId: string,
  options: { agent: string; timeout: string }
): Promise<void> {
  const dbPath = resolve(process.cwd(), '.flock', 'flock.db');
  const db = createDatabase(dbPath);

  // Load config
  const configResult = loadConfigSync();
  if (configResult.isErr()) {
    console.error(`Failed to load config: ${configResult.error.message}`);
    process.exit(1);
  }
  const config = configResult.value;

  // Create orchestrator
  const orchestrator = new FlockOrchestrator(db, config);

  // Start the run
  const timeout = parseInt(options.timeout, 10) * 60 * 1000; // Convert to ms

  console.log(`Starting task ${taskId} with agent ${options.agent}...`);
  console.log(`Timeout: ${options.timeout} minutes`);
  console.log('');

  const result = await orchestrator.startRun(taskId, options.agent, { timeout_ms: timeout });

  if (result.isErr()) {
    console.error(`Failed to start run: ${result.error.message}`);
    process.exit(1);
  }

  const run = result.value;

  console.log(`Run started: ${run.id}`);
  console.log(`Workspace: ${run.workspace_path}`);
  console.log(`Branch: ${run.branch_name}`);
  console.log('');

  // Stream live output from the log file
  // In a real implementation, this would tail the .flock/logs/{runId}.jsonl file
  // and display events as they occur
  console.log('Agent output:');
  console.log('(Streaming output - TODO: implement live tailing)');
  console.log('');

  // Wait for run to complete (poll DB for status)
  const checkInterval = setInterval(async () => {
    const updatedRun = db.db
      .select()
      .from(db.schema.runs)
      .where(safeEq(db.schema.runs, "id", run.id))
      .get();

    if (!updatedRun) {
      clearInterval(checkInterval);
      console.error('Run disappeared from database');
      process.exit(1);
      return;
    }

    if (updatedRun.status === 'SUCCEEDED' || updatedRun.status === 'FAILED' || updatedRun.status === 'CANCELLED') {
      clearInterval(checkInterval);
      console.log(`\nRun completed with status: ${updatedRun.status}`);
      if (updatedRun.exit_code !== null) {
        console.log(`Exit code: ${updatedRun.exit_code}`);
      }
      process.exit(updatedRun.status === 'SUCCEEDED' ? 0 : 1);
    }
  }, 1000);

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\nStopping run...');
    orchestrator.stopRun(run.id).then((result) => {
      if (result.isErr()) {
        console.error(`Failed to stop run: ${result.error.message}`);
        process.exit(1);
      }
      console.log('Run stopped');
      process.exit(0);
    });
  });
}
