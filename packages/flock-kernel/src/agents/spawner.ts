/**
 * Flock Agent Spawner
 *
 * High-level API for spawning agents.
 * Coordinates workspace creation, agent instantiation, and run management.
 */

import { ok, err, type Result } from 'neverthrow';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FlockDatabase } from '../db/client';
import type { FlockConfig, Run, FlockError } from '../types';
import type { DbRun, NewDbRun } from '../db/schema';
import { FlockError as FlockErrorClass } from '../types';
import { createWorktree } from '../workspace';
import { createCLIAgentAdapter } from './cli-agent';
import type { AgentAdapter } from './adapter';

// ============================================================================
// Spawner Configuration
// ============================================================================

/**
 * Configuration for the agent spawner.
 */
export interface SpawnerConfig {
  /** Database client */
  db: FlockDatabase;
  /** Flock configuration */
  config: FlockConfig;
}

// ============================================================================
// Agent Spawner
// ============================================================================

/**
 * High-level agent spawning API.
 *
 * Orchestrates:
 * - Loading agent configuration
 * - Creating Run records
 * - Setting up workspaces
 * - Instantiating adapters
 * - Streaming events
 * - Updating run status
 */
export class AgentSpawner {
  private db: FlockDatabase;
  private config: FlockConfig;
  private activeAdapters = new Map<string, AgentAdapter>();

  constructor(config: SpawnerConfig) {
    this.db = config.db;
    this.config = config.config;
  }

  /**
   * Spawn an agent for a task.
   *
   * Process:
   * 1. Load agent config from FlockConfig
   * 2. Create a new Run record in DB
   * 3. Create worktree via workspace manager
   * 4. Instantiate CLI adapter
   * 5. Spawn agent and stream events
   * 6. Update Run status on completion
   * 7. Return the Run record
   */
  async spawnAgent(
    taskId: string,
    agentId: string,
    prompt: string,
    branch: string
  ): Promise<Result<Run, FlockError>> {
    // Load agent configuration
    const agentConfig = this.config.agents[agentId];
    if (!agentConfig) {
      return err(
        new FlockErrorClass(
          'CONFIG_NOT_FOUND',
          `Agent configuration not found for: ${agentId}`,
          { agentId }
        )
      );
    }

    // Create Run record
    const runId = randomUUID();
    const startTime = new Date().toISOString();

    // Get task to find project and repo path
    const task = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.id, taskId))
      .get();

    if (!task) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Task not found: ${taskId}`, {
          taskId,
        })
      );
    }

    // Get project to find repo path
    const project = await this.db.db
      .select()
      .from(this.db.schema.projects)
      .where(eq(this.db.schema.projects.id, task.project_id))
      .get();

    if (!project) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Project not found: ${task.project_id}`, {
          projectId: task.project_id,
        })
      );
    }

    // Create worktree
    const workspaceResult = await createWorktree(
      project.repo_path,
      runId,
      agentId
    );
    if (workspaceResult.isErr()) {
      return err(workspaceResult.error);
    }

    const workspacePath = workspaceResult.value.path;

    // Create Run record in DB
    const newRun: NewDbRun = {
      id: runId,
      task_id: taskId,
      agent_id: agentId,
      workspace_path: workspacePath,
      branch_name: branch,
      status: 'SPAWNING',
      started_at: startTime,
    };

    await this.db.db.insert(this.db.schema.runs).values(newRun);

    // Instantiate adapter
    const adapter = createCLIAgentAdapter({
      id: agentId,
      name: agentId,
      kind: 'cli',
      command: agentConfig.command,
      args: agentConfig.args,
      mode: agentConfig.mode,
    });

    this.activeAdapters.set(runId, adapter);

    // Calculate timeout
    const timeout_ms =
      this.config.policies.default_timeout_minutes * 60 * 1000;

    // Spawn the agent
    const agentInput = {
      taskId,
      runId,
      workspacePath,
      branch,
      prompt,
      timeout_ms,
    };

    // Update status to RUNNING
    await this.db.db
      .update(this.db.schema.runs)
      .set({ status: 'RUNNING' })
      .where(eq(this.db.schema.runs.id, runId));

    // Stream events (in background)
    this.streamEvents(adapter, agentInput, runId).catch((error) => {
      console.error(`Error streaming events for run ${runId}:`, error);
    });

    // Return the Run record
    const run: Run = {
      id: runId,
      task_id: taskId,
      agent_id: agentId,
      workspace_path: workspacePath,
      branch_name: branch,
      status: 'RUNNING',
      started_at: startTime,
    };

    return ok(run);
  }

  /**
   * Stop a running agent.
   */
  async stopAgent(runId: string): Promise<Result<void, FlockError>> {
    const adapter = this.activeAdapters.get(runId);
    if (!adapter) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `No active adapter for run: ${runId}`, {
          runId,
        })
      );
    }

    await adapter.stop(runId);
    this.activeAdapters.delete(runId);

    // Update run status
    await this.db.db
      .update(this.db.schema.runs)
      .set({ status: 'CANCELLED', ended_at: new Date().toISOString() })
      .where(eq(this.db.schema.runs.id, runId));

    return ok(undefined);
  }

  /**
   * Stream events from agent and log to database.
   */
  private async streamEvents(
    adapter: AgentAdapter,
    input: Parameters<AgentAdapter['spawn']>[0],
    runId: string
  ): Promise<void> {
    let exitCode: number | null = null;
    let timedOut = false;

    try {
      for await (const event of adapter.spawn(input)) {
        // Log event to database
        await this.db.db.insert(this.db.schema.events).values({
          id: randomUUID(),
          run_id: runId,
          type: event.type as any,
          payload_json: JSON.stringify({ data: event.data }),
          created_at: event.timestamp,
        });

        // Track exit info
        if (event.type === 'exit') {
          try {
            const data = JSON.parse(event.data);
            exitCode = data.exitCode ?? null;
            timedOut = data.timedOut ?? false;
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (error) {
      // Log error event
      await this.db.db.insert(this.db.schema.events).values({
        id: randomUUID(),
        run_id: runId,
        type: 'error' as any,
        payload_json: JSON.stringify({
          data: error instanceof Error ? error.message : 'Unknown error',
        }),
        created_at: new Date().toISOString(),
      });
    } finally {
      // Update run status on completion
      const endedAt = new Date().toISOString();
      const finalStatus =
        exitCode === 0 ? 'SUCCEEDED' : timedOut ? 'FAILED' : 'FAILED';

      await this.db.db
        .update(this.db.schema.runs)
        .set({
          status: finalStatus,
          ended_at: endedAt,
          exit_code: exitCode ?? undefined,
        })
        .where(eq(this.db.schema.runs.id, runId));

      this.activeAdapters.delete(runId);
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an agent spawner.
 */
export function createAgentSpawner(config: SpawnerConfig): AgentSpawner {
  return new AgentSpawner(config);
}
