/**
 * DAG Dependency Resolver
 *
 * Manages task dependencies with validation for:
 * - Circular dependency detection
 * - Self-dependency prevention
 * - Task existence validation
 */

import { eq, and } from 'drizzle-orm';
import { ok, err, type Result } from 'neverthrow';
import type { FlockDatabase } from '../db/client';
import type { FlockError, TaskState } from '../types';
import { FlockError as FlockErrorClass } from '../types';

/**
 * Terminal states that satisfy dependencies.
 *
 * A dependency is considered "met" when it's in one of these states.
 */
const TERMINAL_STATES: TaskState[] = ['MERGED', 'APPROVED', 'ARCHIVED'];

/**
 * DAG Dependency Resolver
 *
 * Provides CRUD operations for task dependencies with cycle detection.
 */
export class DependencyResolver {
  constructor(private readonly db: FlockDatabase) {}

  /**
   * Add a dependency edge to the DAG.
   *
   * Validates:
   * - Both tasks exist
   * - No self-dependency
   * - No circular dependency (after adding this edge)
   */
  async addDependency(
    taskId: string,
    dependsOnTaskId: string
  ): Promise<Result<void, FlockError>> {
    // Prevent self-dependency
    if (taskId === dependsOnTaskId) {
      return err(
        new FlockErrorClass(
          'DATABASE_ERROR',
          `Task cannot depend on itself: ${taskId}`,
          { taskId }
        )
      );
    }

    // Validate both tasks exist
    const [task, dependsOnTask] = await Promise.all([
      this.db.db
        .select()
        .from(this.db.schema.tasks)
        .where(eq(this.db.schema.tasks.id, taskId))
        .get(),
      this.db.db
        .select()
        .from(this.db.schema.tasks)
        .where(eq(this.db.schema.tasks.id, dependsOnTaskId))
        .get(),
    ]);

    if (!task) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Task not found: ${taskId}`, {
          taskId,
        })
      );
    }

    if (!dependsOnTask) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Dependency task not found: ${dependsOnTaskId}`, {
          dependsOnTaskId,
        })
      );
    }

    // Check for circular dependency
    const wouldCreateCycle = await this.#wouldCreateCycle(taskId, dependsOnTaskId);
    if (wouldCreateCycle) {
      return err(
        new FlockErrorClass(
          'DATABASE_ERROR',
          `Adding dependency would create a cycle: ${taskId} -> ${dependsOnTaskId}`,
          { taskId, dependsOnTaskId }
        )
      );
    }

    // Check if dependency already exists
    const existing = await this.db.db
      .select()
      .from(this.db.schema.task_dependencies)
      .where(
        and(
          eq(this.db.schema.task_dependencies.task_id, taskId),
          eq(this.db.schema.task_dependencies.depends_on_task_id, dependsOnTaskId)
        )
      )
      .get();

    if (existing) {
      // Idempotent - already exists
      return ok(undefined);
    }

    // Add the dependency
    await this.db.db
      .insert(this.db.schema.task_dependencies)
      .values({
        task_id: taskId,
        depends_on_task_id: dependsOnTaskId,
      });

    return ok(undefined);
  }

  /**
   * Remove a dependency edge from the DAG.
   */
  async removeDependency(
    taskId: string,
    dependsOnTaskId: string
  ): Promise<Result<void, FlockError>> {
    await this.db.db
      .delete(this.db.schema.task_dependencies)
      .where(
        and(
          eq(this.db.schema.task_dependencies.task_id, taskId),
          eq(this.db.schema.task_dependencies.depends_on_task_id, dependsOnTaskId)
        )
      );

    return ok(undefined);
  }

  /**
   * Get all tasks that the given task depends on.
   *
   * Returns direct dependencies only (not transitive).
   */
  async getDependencies(taskId: string): Promise<Result<string[], FlockError>> {
    const dependencies = await this.db.db
      .select()
      .from(this.db.schema.task_dependencies)
      .where(eq(this.db.schema.task_dependencies.task_id, taskId))
      .all();

    return ok(dependencies.map((d) => d.depends_on_task_id));
  }

  /**
   * Get all tasks that depend on the given task.
   *
   * Returns direct dependents only (not transitive).
   */
  async getDependents(taskId: string): Promise<Result<string[], FlockError>> {
    const dependents = await this.db.db
      .select()
      .from(this.db.schema.task_dependencies)
      .where(eq(this.db.schema.task_dependencies.depends_on_task_id, taskId))
      .all();

    return ok(dependents.map((d) => d.task_id));
  }

  /**
   * Check if all dependencies for a task are met.
   *
   * A dependency is "met" when the dependent task is in a terminal state:
   * MERGED, APPROVED, or ARCHIVED.
   */
  async areDependenciesMet(taskId: string): Promise<Result<boolean, FlockError>> {
    const dependencies = await this.getDependencies(taskId);

    if (dependencies.isErr()) {
      return err(dependencies.error);
    }

    if (dependencies.value.length === 0) {
      // No dependencies means they're trivially met
      return ok(true);
    }

    // Check the status of each dependency
    for (const depId of dependencies.value) {
      const depTask = await this.db.db
        .select()
        .from(this.db.schema.tasks)
        .where(eq(this.db.schema.tasks.id, depId))
        .get();

      if (!depTask) {
        return err(
          new FlockErrorClass('DATABASE_ERROR', `Dependency task not found: ${depId}`, {
            depId,
          })
        );
      }

      if (!TERMINAL_STATES.includes(depTask.status as TaskState)) {
        // At least one dependency is not met
        return ok(false);
      }
    }

    // All dependencies are in terminal states
    return ok(true);
  }

  /**
   * Check if adding an edge would create a cycle.
   *
   * Uses DFS to detect if adding (taskId -> dependsOnTaskId) would create
   * a path from dependsOnTaskId back to taskId.
   */
  async #wouldCreateCycle(taskId: string, dependsOnTaskId: string): Promise<boolean> {
    // Build adjacency map for DFS
    const adj = await this.#buildAdjacencyMap();

    // Add the new edge temporarily
    const newAdj = new Map(adj);
    if (!newAdj.has(taskId)) {
      newAdj.set(taskId, []);
    }
    newAdj.get(taskId)!.push(dependsOnTaskId);

    // Check if there's a path from dependsOnTaskId to taskId
    return this.#hasPath(newAdj, dependsOnTaskId, taskId, new Set());
  }

  /**
   * Build adjacency map for all existing dependencies.
   *
   * Maps task_id -> array of depends_on_task_id
   */
  async #buildAdjacencyMap(): Promise<Map<string, string[]>> {
    const allDeps = await this.db.db
      .select()
      .from(this.db.schema.task_dependencies)
      .all();

    const adj = new Map<string, string[]>();
    for (const dep of allDeps) {
      if (!adj.has(dep.task_id)) {
        adj.set(dep.task_id, []);
      }
      adj.get(dep.task_id)!.push(dep.depends_on_task_id);
    }

    return adj;
  }

  /**
   * DFS-based path detection for cycle checking.
   */
  #hasPath(
    adj: Map<string, string[]>,
    start: string,
    target: string,
    visited: Set<string>
  ): boolean {
    if (start === target) {
      return true;
    }

    if (visited.has(start)) {
      return false; // Already visited, avoid infinite loop
    }

    visited.add(start);

    const neighbors = adj.get(start) ?? [];
    for (const neighbor of neighbors) {
      if (this.#hasPath(adj, neighbor, target, visited)) {
        return true;
      }
    }

    return false;
  }
}

/**
 * Factory function to create a dependency resolver.
 */
export function createDependencyResolver(db: FlockDatabase): DependencyResolver {
  return new DependencyResolver(db);
}
