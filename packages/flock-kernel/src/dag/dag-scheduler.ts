/**
 * DAG Scheduler
 *
 * Provides task scheduling based on dependency state:
 * - Find ready tasks (all dependencies met)
 * - Get next task to run (priority-based)
 * - Propagate status updates to unblock dependents
 */

import { eq, and } from 'drizzle-orm';
import { ok, err, type Result } from 'neverthrow';
import type { FlockDatabase } from '../db/client';
import type { FlockError, TaskState } from '../types';
import { FlockError as FlockErrorClass } from '../types';
import { DependencyResolver } from './dependency-resolver';

/**
 * Priority ordering for task selection.
 *
 * Higher priority = selected first.
 */
const PRIORITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * States where a task can be considered "ready" to run.
 */
const READY_STATES: TaskState[] = ['DRAFT', 'READY'];

/**
 * DAG Scheduler
 *
 * Schedules tasks based on dependency resolution and priority.
 */
export class DAGScheduler {
  private resolver: DependencyResolver;

  constructor(private readonly db: FlockDatabase) {
    this.resolver = new DependencyResolver(db);
  }

  /**
   * Get all tasks that are ready to run.
   *
   * A task is "ready" when:
   * 1. It's in DRAFT or READY state
   * 2. All its dependencies are met (in terminal state)
   */
  async getReadyTasks(projectId: string): Promise<Result<string[], FlockError>> {
    // Get all tasks for this project in ready states
    const tasks = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.project_id, projectId))
      .all();

    const readyTasks: string[] = [];

    for (const task of tasks) {
      // Skip tasks not in ready states
      if (!READY_STATES.includes(task.status as TaskState)) {
        continue;
      }

      // Check if dependencies are met
      const depsMet = await this.resolver.areDependenciesMet(task.id);

      if (depsMet.isErr()) {
        return err(depsMet.error);
      }

      if (depsMet.value) {
        readyTasks.push(task.id);
      }
    }

    return ok(readyTasks);
  }

  /**
   * Get the next task to run.
   *
   * Returns the highest-priority ready task.
   * Returns null if no tasks are ready.
   */
  async getNextTask(projectId: string): Promise<Result<string | null, FlockError>> {
    const readyTasks = await this.getReadyTasks(projectId);

    if (readyTasks.isErr()) {
      return err(readyTasks.error);
    }

    if (readyTasks.value.length === 0) {
      return ok(null);
    }

    // Get all ready tasks
    const allReadyTasks = await Promise.all(
      readyTasks.value.map(async (taskId) => {
        return this.db.db
          .select()
          .from(this.db.schema.tasks)
          .where(eq(this.db.schema.tasks.id, taskId))
          .get();
      })
    );

    // Sort by priority (highest first), then by creation time (oldest first)
    const sorted = allReadyTasks
      .filter((t): t is NonNullable<typeof t> => t !== undefined)
      .sort((a, b) => {
        const aPriority = PRIORITY_ORDER[a.priority] ?? 0;
        const bPriority = PRIORITY_ORDER[b.priority] ?? 0;
        const priorityDiff = bPriority - aPriority;
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        // Tie-breaker: older tasks first
        return a.created_at.localeCompare(b.created_at);
      });

    return ok(sorted[0]?.id ?? null);
  }

  /**
   * Propagate status updates to unblock dependent tasks.
   *
   * When a task completes (reaches a terminal state), check which
   * dependent tasks become unblocked and return their IDs.
   *
   * This is called after task state transitions to MERGED, APPROVED, or ARCHIVED.
   */
  async propagateStatus(
    taskId: string,
    newStatus: TaskState
  ): Promise<Result<string[], FlockError>> {
    // Only propagate from terminal states
    const terminalStates: TaskState[] = ['MERGED', 'APPROVED', 'ARCHIVED'];
    if (!terminalStates.includes(newStatus)) {
      // Not a terminal state, no propagation needed
      return ok([]);
    }

    // Get all tasks that depend on this task
    const dependentsResult = await this.resolver.getDependents(taskId);

    if (dependentsResult.isErr()) {
      return err(dependentsResult.error);
    }

    const dependents = dependentsResult.value;
    const newlyUnblocked: string[] = [];

    // Check each dependent to see if it's now unblocked
    for (const dependentId of dependents) {
      const depsMet = await this.resolver.areDependenciesMet(dependentId);

      if (depsMet.isErr()) {
        return err(depsMet.error);
      }

      if (depsMet.value) {
        newlyUnblocked.push(dependentId);
      }
    }

    return ok(newlyUnblocked);
  }

  /**
   * Get task count by priority for a project.
   *
   * Useful for dashboard/visualization.
   */
  async getTaskCountByPriority(projectId: string): Promise<
    Result<Record<string, number>, FlockError>
  > {
    const tasks = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.project_id, projectId))
      .all();

    const counts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const task of tasks) {
      const priority = task.priority;
      counts[priority] = (counts[priority] ?? 0) + 1;
    }

    return ok(counts);
  }

  /**
   * Get blocking chain for a task.
   *
   * Returns all tasks that are blocking this task (transitive dependencies).
   */
  async getBlockingChain(taskId: string): Promise<Result<string[], FlockError>> {
    const visited = new Set<string>();
    const blocking: string[] = [];

    await this.#collectBlockingTasks(taskId, visited, blocking);

    return ok(blocking);
  }

  /**
   * Recursively collect blocking tasks.
   */
  async #collectBlockingTasks(
    taskId: string,
    visited: Set<string>,
    blocking: string[]
  ): Promise<void> {
    if (visited.has(taskId)) {
      return;
    }

    visited.add(taskId);

    const depsResult = await this.resolver.getDependencies(taskId);

    if (depsResult.isErr()) {
      return;
    }

    const deps = depsResult.value;

    for (const depId of deps) {
      blocking.push(depId);
      await this.#collectBlockingTasks(depId, visited, blocking);
    }
  }

  /**
   * Get blocked chain for a task.
   *
   * Returns all tasks that are blocked by this task (transitive dependents).
   */
  async getBlockedChain(taskId: string): Promise<Result<string[], FlockError>> {
    const visited = new Set<string>();
    const blocked: string[] = [];

    await this.#collectBlockedTasks(taskId, visited, blocked);

    return ok(blocked);
  }

  /**
   * Recursively collect blocked tasks.
   */
  async #collectBlockedTasks(
    taskId: string,
    visited: Set<string>,
    blocked: string[]
  ): Promise<void> {
    if (visited.has(taskId)) {
      return;
    }

    visited.add(taskId);

    const dependentsResult = await this.resolver.getDependents(taskId);

    if (dependentsResult.isErr()) {
      return;
    }

    const dependents = dependentsResult.value;

    for (const dependentId of dependents) {
      blocked.push(dependentId);
      await this.#collectBlockedTasks(dependentId, visited, blocked);
    }
  }
}

/**
 * Factory function to create a DAG scheduler.
 */
export function createDAGScheduler(db: FlockDatabase): DAGScheduler {
  return new DAGScheduler(db);
}
