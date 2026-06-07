/**
 * Flock Run Queue
 *
 * Manages the execution queue for agent runs.
 * Handles queuing, dequeueing, and status reporting.
 */

import { eq, and, desc, inArray } from 'drizzle-orm';
import { ok, err, type Result } from 'neverthrow';
import { randomUUID } from 'node:crypto';
import type { FlockDatabase } from '../db/client';
import type { FlockError, Run, RunState } from '../types';
import { FlockError as FlockErrorClass } from '../types';

/**
 * A queue entry representing a run waiting to be scheduled.
 */
export interface QueueEntry {
  /** Unique run identifier */
  runId: string;
  /** Task this run is for */
  taskId: string;
  /** Agent assigned to this run */
  agentId: string;
  /** Priority level (higher = more urgent) */
  priority: number;
  /** ISO timestamp when entry was enqueued */
  enqueuedAt: string;
}

/**
 * Status of the run queue.
 */
export interface QueueStatus {
  /** Currently queued runs */
  queued: QueueEntry[];
  /** Currently running runs */
  running: Run[];
  /** Number of available slots for new runs */
  availableSlots: number;
  /** Maximum parallel runs allowed */
  maxParallel: number;
}

/**
 * Priority enum mapped to numeric values.
 */
export const PRIORITY_VALUES: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Default priority for runs without explicit priority.
 */
export const DEFAULT_PRIORITY = 2; // medium

/**
 * Active run states that count against parallel limit.
 */
const ACTIVE_RUN_STATES: RunState[] = ['SPAWNING', 'RUNNING', 'STOPPING'];

/**
 * Run Queue Manager
 *
 * Handles queuing and dequeuing of agent runs.
 */
export class RunQueue {
  constructor(
    private readonly db: FlockDatabase,
    private readonly maxParallel: number
  ) {}

  /**
   * Add a run to the queue.
   *
   * Creates a QUEUED run and returns its ID.
   * Priority can be 1-4 (1=low, 4=critical), defaults to 2 (medium).
   */
  async addToQueue(
    taskId: string,
    agentId: string,
    priority?: number
  ): Promise<Result<string, FlockError>> {
    const finalPriority = priority ?? DEFAULT_PRIORITY;
    const now = new Date().toISOString();

    // Validate task exists
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

    // Validate agent exists
    const agent = await this.db.db
      .select()
      .from(this.db.schema.agents)
      .where(eq(this.db.schema.agents.id, agentId))
      .get();

    if (!agent) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Agent not found: ${agentId}`, {
          agentId,
        })
      );
    }

    // Create the run in QUEUED state
    const runId = randomUUID();

    await this.db.db
      .insert(this.db.schema.runs)
      .values({
        id: runId,
        task_id: taskId,
        agent_id: agentId,
        workspace_path: '', // Will be set when run starts
        branch_name: '', // Will be set when run starts
        status: 'QUEUED',
        started_at: now,
      });

    return ok(runId);
  }

  /**
   * Remove a run from the queue.
   *
   * Deletes the run record entirely.
   */
  async removeFromQueue(runId: string): Promise<Result<void, FlockError>> {
    await this.db.db
      .delete(this.db.schema.runs)
      .where(eq(this.db.schema.runs.id, runId));

    return ok(undefined);
  }

  /**
   * Get the current status of the queue.
   *
   * Returns queued runs, running runs, and available slot count.
   */
  async getQueueStatus(): Promise<Result<QueueStatus, FlockError>> {
    // Get queued runs
    const queuedRuns = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(eq(this.db.schema.runs.status, 'QUEUED'))
      .orderBy(this.db.schema.runs.started_at)
      .all(); // FIFO by default

    const queued: QueueEntry[] = await Promise.all(
      queuedRuns.map(async (run) => {
        // Get task priority
        const task = await this.db.db
          .select()
          .from(this.db.schema.tasks)
          .where(eq(this.db.schema.tasks.id, run.task_id))
          .get();

        const priority = task ? PRIORITY_VALUES[task.priority] ?? DEFAULT_PRIORITY : DEFAULT_PRIORITY;

        return {
          runId: run.id,
          taskId: run.task_id,
          agentId: run.agent_id,
          priority,
          enqueuedAt: run.started_at,
        };
      })
    );

    // Sort queued by priority (higher first), then by enqueue time
    queued.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return new Date(a.enqueuedAt).getTime() - new Date(b.enqueuedAt).getTime(); // FIFO for same priority
    });

    // Get currently running runs
    const running = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(inArray(this.db.schema.runs.status, ACTIVE_RUN_STATES))
      .all();

    // Calculate available slots
    const activeCount = running.length;
    const availableSlots = Math.max(0, this.maxParallel - activeCount);

    return ok({
      queued,
      running: running.map((r) => ({
        id: r.id,
        task_id: r.task_id,
        agent_id: r.agent_id,
        workspace_path: r.workspace_path,
        branch_name: r.branch_name,
        status: r.status as RunState,
        started_at: r.started_at,
        ended_at: r.ended_at ?? undefined,
        exit_code: r.exit_code ?? undefined,
      })),
      availableSlots,
      maxParallel: this.maxParallel,
    });
  }

  /**
   * Get the count of currently active (running) runs.
   */
  async getActiveRunCount(): Promise<number> {
    const result = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(inArray(this.db.schema.runs.status, ACTIVE_RUN_STATES));

    return result.length;
  }

  /**
   * Get queued runs sorted by priority and time.
   */
  async getQueuedRuns(): Promise<Result<QueueEntry[], FlockError>> {
    const status = await this.getQueueStatus();

    if (status.isErr()) {
      return err(status.error);
    }

    return ok(status.value.queued);
  }

  /**
   * Get all runs in a specific state.
   */
  async getRunsByState(state: RunState): Promise<Result<Run[], FlockError>> {
    const runs = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(eq(this.db.schema.runs.status, state));

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
 * Factory function to create a run queue.
 */
export function createRunQueue(
  db: FlockDatabase,
  maxParallel: number
): RunQueue {
  return new RunQueue(db, maxParallel);
}
