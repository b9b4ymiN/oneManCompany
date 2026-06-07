/**
 * Flock Retry Engine
 *
 * Auto-retry logic for failed agent runs and gate failures.
 * Supports configurable policies, escalation, and retry history tracking.
 */

import { randomUUID } from 'node:crypto';
import { ok, err, type Result } from 'neverthrow';
import { eq, and, desc } from 'drizzle-orm';
import type { FlockDatabase } from '../db/client';
import type { FlockError, Run, RetryPolicy } from '../types';
import type { NewDbRun } from '../db/schema';
import { FlockError as FlockErrorClass } from '../types';
import { createEventLogger, type FlockEventLogger } from '../observability/event-log';

// ============================================================================
// Retry Types
// ============================================================================

/**
 * Decision result for retry evaluation.
 */
export interface RetryDecision {
  /** Whether a retry should occur */
  shouldRetry: boolean;
  /** Current retry attempt number */
  attempt: number;
  /** Optional: different agent to try for this retry */
  nextAgent?: string;
  /** Human-readable reason for the decision */
  reason: string;
  /** Whether max retries have been exceeded */
  maxRetriesExceeded: boolean;
}

/**
 * Record of a retry attempt.
 */
export interface RetryAttempt {
  /** Unique identifier for this retry attempt */
  id: string;
  /** Task being retried */
  taskId: string;
  /** Original run ID that failed */
  originalRunId: string;
  /** New run ID created for retry */
  retryRunId: string;
  /** Agent used for this attempt */
  agentId: string;
  /** Attempt number (1, 2, 3, ...) */
  attempt: number;
  /** Timestamp when retry was triggered */
  triggeredAt: string;
  /** Reason for retry */
  reason: string;
  /** Exit code from failed run */
  exitCode?: number;
  /** Whether retry was successful */
  succeeded?: boolean;
}

// ============================================================================
// Retry Engine
// ============================================================================

/**
 * Retry evaluation and execution engine.
 *
 * Evaluates retry eligibility based on policies,
 * creates retry runs, and tracks retry history.
 */
export class RetryEngine {
  private db: FlockDatabase;
  private eventLogger: FlockEventLogger;

  constructor(db: FlockDatabase, eventLogger: FlockEventLogger) {
    this.db = db;
    this.eventLogger = eventLogger;
  }

  /**
   * Evaluate whether a retry should occur based on policy.
   *
   * Process:
   * 1. Check if max retries exceeded
   * 2. Check if failure type matches retry policy
   * 3. Check if agent is allowed for retry
   * 4. Return retry decision
   */
  async evaluateRetry(
    runId: string,
    policy: RetryPolicy
  ): Promise<Result<RetryDecision, FlockError>> {
    // Load the run
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

    // Load the task to get retry count
    const task = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.id, run.task_id))
      .get();

    if (!task) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Task not found: ${run.task_id}`, {
          taskId: run.task_id,
        })
      );
    }

    // Count previous retry attempts for this task
    const retryHistory = await this.getRetryHistory(run.task_id);
    const currentAttempt = retryHistory.isErr() ? 0 : retryHistory.value.length;

    // Check if max retries exceeded
    const maxRetriesExceeded = currentAttempt >= policy.maxRetries;
    if (maxRetriesExceeded) {
      return ok({
        shouldRetry: false,
        attempt: currentAttempt,
        reason: `Max retries (${policy.maxRetries}) exceeded`,
        maxRetriesExceeded: true,
      });
    }

    // Determine failure type and check policy
    const isGateFailure = task.status === 'GATES_FAILED';
    const isAgentCrash = run.exit_code !== null && run.exit_code !== 0;

    let shouldRetry = false;
    let reason = '';

    if (isGateFailure && policy.retryOnGateFailure) {
      shouldRetry = true;
      reason = 'Gates failed, retrying with same agent';
    } else if (isAgentCrash && policy.retryOnAgentCrash) {
      shouldRetry = true;
      reason = `Agent crashed with exit code ${run.exit_code}, retrying`;
    } else {
      reason = 'Failure type not configured for retry';
    }

    // Check if agent is allowed for retry
    if (shouldRetry && policy.allowedAgents && policy.allowedAgents.length > 0) {
      if (!policy.allowedAgents.includes(run.agent_id)) {
        shouldRetry = false;
        reason = `Agent ${run.agent_id} not in allowed retry list`;
      }
    }

    return ok({
      shouldRetry,
      attempt: currentAttempt + 1,
      reason,
      maxRetriesExceeded: false,
      nextAgent: shouldRetry ? run.agent_id : undefined,
    });
  }

  /**
   * Execute a retry for a task.
   *
   * Process:
   * 1. Load original run and task
   * 2. Create new run for retry
   * 3. Log retry event to event log
   * 4. Increment retry count in metadata
   * 5. Return new run
   */
  async executeRetry(
    taskId: string,
    policy: RetryPolicy
  ): Promise<Result<Run, FlockError>> {
    // Load the task
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

    // Get the most recent run for this task
    const lastRun = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(eq(this.db.schema.runs.task_id, taskId))
      .orderBy(desc(this.db.schema.runs.started_at))
      .limit(1)
      .get();

    if (!lastRun) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `No run found for task: ${taskId}`, {
          taskId,
        })
      );
    }

    // Count retry attempts
    const retryHistoryResult = await this.getRetryHistory(taskId);
    const attemptNumber = retryHistoryResult.isErr()
      ? 1
      : retryHistoryResult.value.length + 1;

    // Create new run for retry
    const retryRunId = randomUUID();
    const now = new Date().toISOString();

    const newRun: NewDbRun = {
      id: retryRunId,
      task_id: taskId,
      agent_id: lastRun.agent_id,
      workspace_path: lastRun.workspace_path,
      branch_name: lastRun.branch_name,
      status: 'QUEUED',
      started_at: now,
      ended_at: null,
      exit_code: null,
    };

    await this.db.db.insert(this.db.schema.runs).values(newRun);

    // Log retry event
    await this.eventLogger.logEvent(lastRun.id, 'retry_triggered', {
      retryRunId,
      attempt: attemptNumber,
      reason: policy.retryOnGateFailure
        ? 'Gate failure'
        : policy.retryOnAgentCrash
          ? 'Agent crash'
          : 'Manual retry',
      policy: {
        maxRetries: policy.maxRetries,
        retryOnGateFailure: policy.retryOnGateFailure,
        retryOnAgentCrash: policy.retryOnAgentCrash,
      },
    });

    // Update task state to READY for retry
    await this.db.db
      .update(this.db.schema.tasks)
      .set({ status: 'READY', updated_at: now })
      .where(eq(this.db.schema.tasks.id, taskId));

    // Return new run
    const retryRun = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(eq(this.db.schema.runs.id, retryRunId))
      .get();

    if (!retryRun) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Failed to retrieve retry run: ${retryRunId}`, {
          retryRunId,
        })
      );
    }

    return ok({
      id: retryRun.id,
      task_id: retryRun.task_id,
      agent_id: retryRun.agent_id,
      workspace_path: retryRun.workspace_path,
      branch_name: retryRun.branch_name,
      status: retryRun.status as Run['status'],
      started_at: retryRun.started_at,
      ended_at: retryRun.ended_at || undefined,
      exit_code: retryRun.exit_code || undefined,
    });
  }

  /**
   * Get retry history for a task.
   *
   * Returns all retry attempts for the task,
   * ordered by most recent first.
   */
  async getRetryHistory(taskId: string): Promise<Result<RetryAttempt[], FlockError>> {
    try {
      // Get all retry_triggered events for this task
      const allRuns = await this.db.db
        .select()
        .from(this.db.schema.runs)
        .where(eq(this.db.schema.runs.task_id, taskId))
        .orderBy(desc(this.db.schema.runs.started_at))
        .all();

      const retryAttempts: RetryAttempt[] = [];

      for (const run of allRuns) {
        // Get events for this run to find retry_triggered events
        const events = await this.eventLogger.getEvents(run.id);

        for (const event of events) {
          if (event.type === 'retry_triggered') {
            const payload = event.payload as {
              retryRunId: string;
              attempt: number;
              reason: string;
            };

            retryAttempts.push({
              id: event.id,
              taskId,
              originalRunId: run.id,
              retryRunId: payload.retryRunId,
              agentId: run.agent_id,
              attempt: payload.attempt,
              triggeredAt: event.created_at,
              reason: payload.reason,
              exitCode: run.exit_code || undefined,
            });
          }
        }
      }

      return ok(retryAttempts);
    } catch (error) {
      return err(
        new FlockErrorClass(
          'DATABASE_ERROR',
          `Failed to get retry history: ${error instanceof Error ? error.message : String(error)}`,
          { taskId, error }
        )
      );
    }
  }

  /**
   * Check if max retries have been exceeded for a task.
   *
   * Returns true if the task has exceeded its configured max retries.
   */
  async shouldEscalate(taskId: string, policy: RetryPolicy): Promise<boolean> {
    const retryHistoryResult = await this.getRetryHistory(taskId);

    if (retryHistoryResult.isErr()) {
      return false;
    }

    const retryCount = retryHistoryResult.value.length;
    return retryCount >= policy.maxRetries;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a retry engine.
 */
export function createRetryEngine(
  db: FlockDatabase,
  eventLogger: FlockEventLogger
): RetryEngine {
  return new RetryEngine(db, eventLogger);
}
