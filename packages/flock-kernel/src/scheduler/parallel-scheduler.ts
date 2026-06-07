/**
 * Flock Parallel Scheduler
 *
 * Schedules and manages parallel agent runs while respecting:
 * - Maximum parallel run limits
 * - Task dependencies (via DAG)
 * - Priority ordering
 * - Agent availability
 */

import { eq, and, inArray } from 'drizzle-orm';
import { ok, err, type Result } from 'neverthrow';
import type { FlockDatabase } from '../db/client';
import type { FlockError, Run, RunState } from '../types';
import { FlockError as FlockErrorClass } from '../types';
import { createDependencyResolver } from '../dag/dependency-resolver';
import { RunQueue, type QueueEntry } from './run-queue';
import { AgentPool, type AgentInfo } from './agent-pool';

/**
 * Active run states that count against parallel limit.
 */
const ACTIVE_RUN_STATES: RunState[] = ['SPAWNING', 'RUNNING', 'STOPPING'];

/**
 * Parallel Scheduler Configuration.
 */
export interface ParallelSchedulerConfig {
  /** Maximum number of parallel runs allowed */
  maxParallelRuns: number;
}

/**
 * Parallel Scheduler
 *
 * Manages the scheduling of parallel agent runs.
 */
export class ParallelScheduler {
  private runQueue: RunQueue;
  private agentPool: AgentPool;
  private dependencyResolver: ReturnType<typeof createDependencyResolver>;

  constructor(
    private readonly db: FlockDatabase,
    private readonly config: ParallelSchedulerConfig
  ) {
    this.runQueue = new RunQueue(db, config.maxParallelRuns);
    this.agentPool = new AgentPool(db);
    this.dependencyResolver = createDependencyResolver(db);
  }

  /**
   * Schedule the next batch of runs from the queue.
   *
   * Pulls tasks from queue respecting:
   * - max_parallel_runs limit
   * - Task dependencies (only schedule if dependencies are met)
   * - Priority ordering
   *
   * Returns array of newly started runs.
   */
  async scheduleNext(): Promise<Result<Run[], FlockError>> {
    const status = await this.runQueue.getQueueStatus();

    if (status.isErr()) {
      return err(status.error);
    }

    const { queued, availableSlots, running } = status.value;

    // If no available slots, return empty array
    if (availableSlots <= 0) {
      return ok([]);
    }

    // If nothing queued, return empty array
    if (queued.length === 0) {
      return ok([]);
    }

    // Determine how many runs we can start
    const toStart = Math.min(availableSlots, queued.length);

    // Get runs that are ready (dependencies met)
    const readyRuns: Array<{ runId: string; entry: QueueEntry }> = [];

    for (let i = 0; i < toStart && i < queued.length; i++) {
      const entry = queued[i];
      if (!entry) continue; // Skip if entry is undefined

      // Check if dependencies are met
      const depsMet = await this.dependencyResolver.areDependenciesMet(entry.taskId);

      if (depsMet.isErr()) {
        // Skip this entry if dependency check fails
        continue;
      }

      if (depsMet.value) {
        readyRuns.push({ runId: entry.runId, entry });
      }
    }

    // Update the ready runs to SPAWNING state
    const newlyStarted: Run[] = [];

    for (const { runId, entry } of readyRuns) {
      const now = new Date().toISOString();

      await this.db.db
        .update(this.db.schema.runs)
        .set({ status: 'SPAWNING' })
        .where(eq(this.db.schema.runs.id, runId));

      newlyStarted.push({
        id: runId,
        task_id: entry.taskId,
        agent_id: entry.agentId,
        workspace_path: '', // Will be set by orchestrator
        branch_name: '', // Will be set by orchestrator
        status: 'SPAWNING',
        started_at: entry.enqueuedAt,
        ended_at: undefined,
        exit_code: undefined,
      });
    }

    return ok(newlyStarted);
  }

  /**
   * Get the count of currently active (running) runs.
   */
  async getActiveRunCount(): Promise<number> {
    return this.runQueue.getActiveRunCount();
  }

  /**
   * Check if a new run can be started.
   *
   * Optionally checks if a specific agent is available.
   */
  async canStartRun(agentId?: string): Promise<Result<boolean, FlockError>> {
    const status = await this.runQueue.getQueueStatus();

    if (status.isErr()) {
      return err(status.error);
    }

    const { availableSlots } = status.value;

    // Check general parallel limit
    if (availableSlots <= 0) {
      return ok(false);
    }

    // If agent specified, check if it's available
    if (agentId) {
      const isBusy = await this.agentPool.isAgentBusy(agentId);
      // Agent is considered available even if busy (can handle multiple runs)
      // This check is informational only
    }

    return ok(true);
  }

  /**
   * Allocate the best available agent for a task.
   *
   * Selection criteria:
   * - Prefer agents not currently running (least busy first)
   * - Respect agent mode (readonly agents don't need worktree)
   *
   * Returns the agent ID.
   */
  async allocateAgent(taskId: string): Promise<Result<string, FlockError>> {
    // Get agents sorted by workload (least busy first)
    const agentsResult = await this.agentPool.getAgentsByWorkload();

    if (agentsResult.isErr()) {
      return err(agentsResult.error);
    }

    const agents = agentsResult.value;

    if (agents.length === 0) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', 'No agents available', {
          taskId,
        })
      );
    }

    // Get the task to determine if we need write mode
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

    // Prefer readonly agents if available (they don't need worktree)
    // Otherwise, use the least busy agent regardless of mode
    let selectedAgent: AgentInfo | undefined = agents[0];

    // Try to find a readonly agent first
    const readonlyAgents = agents.filter((a) => a.config.mode === 'readonly');
    if (readonlyAgents.length > 0) {
      // Pick the least busy readonly agent
      selectedAgent = readonlyAgents[0];
    } else {
      // No readonly agents, pick the least busy agent overall
      selectedAgent = agents[0];
    }

    // This should never happen since we check agents.length === 0 above
    if (!selectedAgent) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', 'Failed to select agent', {
          taskId,
        })
      );
    }

    return ok(selectedAgent.id);
  }

  /**
   * Add a run to the queue.
   *
   * Creates a QUEUED run and returns its ID.
   */
  async addToQueue(
    taskId: string,
    agentId: string,
    priority?: number
  ): Promise<Result<string, FlockError>> {
    return this.runQueue.addToQueue(taskId, agentId, priority);
  }

  /**
   * Remove a run from the queue.
   */
  async removeFromQueue(runId: string): Promise<Result<void, FlockError>> {
    return this.runQueue.removeFromQueue(runId);
  }

  /**
   * Get the current queue status.
   */
  async getQueueStatus(): Promise<
    Result<
      {
        queued: QueueEntry[];
        running: Run[];
        availableSlots: number;
        maxParallel: number;
      },
      FlockError
    >
  > {
    return this.runQueue.getQueueStatus();
  }

  /**
   * Get available agents.
   */
  async getAvailableAgents(): Promise<Result<AgentInfo[], FlockError>> {
    return this.agentPool.getAvailableAgents();
  }

  /**
   * Check if an agent is busy.
   */
  async isAgentBusy(agentId: string): Promise<boolean> {
    return this.agentPool.isAgentBusy(agentId);
  }

  /**
   * Get an agent's workload count.
   */
  async getAgentWorkload(agentId: string): Promise<number> {
    return this.agentPool.getAgentWorkload(agentId);
  }

  /**
   * Update run state (used by orchestrator when runs complete).
   */
  async updateRunState(
    runId: string,
    newState: RunState
  ): Promise<Result<void, FlockError>> {
    await this.db.db
      .update(this.db.schema.runs)
      .set({ status: newState })
      .where(eq(this.db.schema.runs.id, runId));

    return ok(undefined);
  }

  /**
   * Update run workspace and branch (called when run starts).
   */
  async updateRunStartInfo(
    runId: string,
    workspacePath: string,
    branchName: string
  ): Promise<Result<void, FlockError>> {
    await this.db.db
      .update(this.db.schema.runs)
      .set({
        workspace_path: workspacePath,
        branch_name: branchName,
      })
      .where(eq(this.db.schema.runs.id, runId));

    return ok(undefined);
  }

  /**
   * Update run completion info (called when run ends).
   */
  async updateRunCompletion(
    runId: string,
    exitCode: number
  ): Promise<Result<void, FlockError>> {
    const now = new Date().toISOString();

    await this.db.db
      .update(this.db.schema.runs)
      .set({
        exit_code: exitCode,
        ended_at: now,
      })
      .where(eq(this.db.schema.runs.id, runId));

    return ok(undefined);
  }

  /**
   * Get run by ID.
   */
  async getRun(runId: string): Promise<Result<Run, FlockError>> {
    const run = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(eq(this.db.schema.runs.id, runId))
      .get();

    if (!run) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Run not found: ${runId}`, {
          runId,
        })
      );
    }

    return ok({
      id: run.id,
      task_id: run.task_id,
      agent_id: run.agent_id,
      workspace_path: run.workspace_path,
      branch_name: run.branch_name,
      status: run.status as RunState,
      started_at: run.started_at,
      ended_at: run.ended_at ?? undefined,
      exit_code: run.exit_code ?? undefined,
    });
  }

  /**
   * Get all runs for a task.
   */
  async getRunsForTask(taskId: string): Promise<Result<Run[], FlockError>> {
    const runs = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(eq(this.db.schema.runs.task_id, taskId))
      .orderBy(this.db.schema.runs.started_at);

    return ok(
      runs.map((r) => ({
        id: r.id,
        task_id: r.task_id,
        agent_id: r.agent_id,
        workspace_path: r.workspace_path,
        branch_name: r.branch_name,
        status: r.status as RunState,
        started_at: r.started_at,
        ended_at: r.ended_at ?? undefined,
        exit_code: r.exit_code ?? undefined,
      }))
    );
  }
}

/**
 * Factory function to create a parallel scheduler.
 */
export function createParallelScheduler(
  db: FlockDatabase,
  config: ParallelSchedulerConfig
): ParallelScheduler {
  return new ParallelScheduler(db, config);
}
