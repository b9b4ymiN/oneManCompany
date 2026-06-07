/**
 * DAG Validator
 *
 * Provides DAG validation, cycle detection, and topological sorting.
 */

import { eq } from 'drizzle-orm';
import { ok, err, type Result } from 'neverthrow';
import type { FlockDatabase } from '../db/client';
import type { FlockError } from '../types';
import { FlockError as FlockErrorClass } from '../types';

/**
 * Result of DAG validation.
 */
export interface DAGValidation {
  /** Whether the DAG is valid (no cycles, no orphaned tasks) */
  valid: boolean;
  /** Array of cycles found, where each cycle is an array of task IDs */
  cycles: string[][];
  /** Tasks that have no dependencies and no dependents (entry points with no outgoing edges) */
  orphaned: string[];
}

/**
 * DFS node coloring for cycle detection.
 *
 * WHITE: Not visited
 * GRAY:  Currently visiting (in recursion stack)
 * BLACK: Fully visited
 */
enum NodeColor {
  WHITE = 'WHITE',
  GRAY = 'GRAY',
  BLACK = 'BLACK',
}

/**
 * DAG Validator
 *
 * Validates task dependency graphs and provides ordering.
 */
export class DAGValidator {
  constructor(private readonly db: FlockDatabase) {}

  /**
   * Validate the entire DAG for a project.
   *
   * Returns cycles and orphaned tasks.
   */
  async validateDAG(projectId: string): Promise<Result<DAGValidation, FlockError>> {
    // Get all tasks for this project
    const tasks = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.project_id, projectId))
      .all();

    const taskIds = tasks.map((t) => t.id);

    // Build adjacency map
    const adj = await this.#buildProjectAdjacencyMap(taskIds);

    // Detect cycles using DFS with coloring
    const cycles = this.#detectCycles(adj, taskIds);

    // Find orphaned tasks (no deps and no dependents)
    const orphaned = this.#findOrphanedTasks(adj, taskIds);

    return ok({
      valid: cycles.length === 0,
      cycles,
      orphaned,
    });
  }

  /**
   * Detect if adding a specific edge would create a circular dependency.
   *
   * This is a targeted check for a single edge addition.
   */
  async detectCircularDependency(
    taskId: string,
    dependsOnTaskId: string
  ): Promise<boolean> {
    // Prevent self-dependency
    if (taskId === dependsOnTaskId) {
      return true;
    }

    // Build current adjacency map
    const adj = await this.#buildAdjacencyMap();

    // Temporarily add the new edge
    const newAdj = new Map(adj);
    if (!newAdj.has(taskId)) {
      newAdj.set(taskId, []);
    }
    newAdj.get(taskId)!.push(dependsOnTaskId);

    // Check if there's a path from dependsOnTaskId to taskId
    // This would mean adding taskId -> dependsOnTaskId creates a cycle
    return this.#hasPath(newAdj, dependsOnTaskId, taskId, new Set());
  }

  /**
   * Perform topological sort on the project's task DAG.
   *
   * Returns tasks in dependency order (dependencies before dependents).
   * Tasks with no dependencies come first.
   *
   * Uses Kahn's algorithm.
   */
  async topologicalSort(projectId: string): Promise<Result<string[], FlockError>> {
    // Get all tasks for this project
    const tasks = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.project_id, projectId))
      .all();

    const taskIds = tasks.map((t) => t.id);

    // Build adjacency map and in-degree count
    const adj = await this.#buildProjectAdjacencyMap(taskIds);
    const inDegree = new Map<string, number>();

    // Initialize in-degree for all tasks
    for (const taskId of taskIds) {
      inDegree.set(taskId, 0);
    }

    // Count in-degrees
    for (const [from, toList] of adj.entries()) {
      for (const to of toList) {
        const current = inDegree.get(to) ?? 0;
        inDegree.set(to, current + 1);
      }
    }

    // Kahn's algorithm: start with nodes having in-degree 0
    const queue: string[] = [];
    for (const [taskId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      // Reduce in-degree for neighbors
      const neighbors = adj.get(current) ?? [];
      for (const neighbor of neighbors) {
        const degree = inDegree.get(neighbor)!;
        inDegree.set(neighbor, degree - 1);

        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    // If not all nodes are in result, there's a cycle
    if (result.length !== taskIds.length) {
      return err(
        new FlockErrorClass(
          'DATABASE_ERROR',
          'Cannot perform topological sort: DAG contains cycles',
          { taskCount: taskIds.length, sortedCount: result.length }
        )
      );
    }

    return ok(result);
  }

  /**
   * Build adjacency map for specific tasks.
   *
   * Maps task_id -> array of depends_on_task_id
   */
  async #buildProjectAdjacencyMap(taskIds: Set<string> | string[]): Promise<Map<string, string[]>> {
    const taskIdSet = new Set(taskIds);

    const allDeps = await this.db.db
      .select()
      .from(this.db.schema.task_dependencies)
      .all();

    // Filter to only include tasks in the set
    const relevantDeps = allDeps.filter(
      (d) => taskIdSet.has(d.task_id) && taskIdSet.has(d.depends_on_task_id)
    );

    const adj = new Map<string, string[]>();
    for (const dep of relevantDeps) {
      if (!adj.has(dep.task_id)) {
        adj.set(dep.task_id, []);
      }
      adj.get(dep.task_id)!.push(dep.depends_on_task_id);
    }

    // Ensure all tasks have entries
    for (const taskId of taskIdSet) {
      if (!adj.has(taskId)) {
        adj.set(taskId, []);
      }
    }

    return adj;
  }

  /**
   * Build full adjacency map for all tasks.
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
   * Detect cycles using DFS with node coloring.
   *
   * Returns array of cycles, where each cycle is an array of task IDs.
   */
  #detectCycles(adj: Map<string, string[]>, taskIds: string[]): string[][] {
    const cycles: string[][] = [];
    const color = new Map<string, NodeColor>();
    const parent = new Map<string, string | null>();

    // Initialize all nodes as WHITE
    for (const taskId of taskIds) {
      color.set(taskId, NodeColor.WHITE);
      parent.set(taskId, null);
    }

    // DFS from each unvisited node
    for (const taskId of taskIds) {
      if (color.get(taskId) === NodeColor.WHITE) {
        const cyclePath = this.#dfsDetectCycle(taskId, adj, color, parent);
        if (cyclePath) {
          cycles.push(cyclePath);
        }
      }
    }

    return cycles;
  }

  /**
   * DFS helper for cycle detection.
   *
   * Returns the cycle path if found, null otherwise.
   */
  #dfsDetectCycle(
    nodeId: string,
    adj: Map<string, string[]>,
    color: Map<string, NodeColor>,
    parent: Map<string, string | null>
  ): string[] | null {
    color.set(nodeId, NodeColor.GRAY);

    const neighbors = adj.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      if (color.get(neighbor) === NodeColor.GRAY) {
        // Back edge found - this is a cycle
        return this.#extractCycle(nodeId, neighbor, parent);
      }

      if (color.get(neighbor) === NodeColor.WHITE) {
        parent.set(neighbor, nodeId);
        const cycle = this.#dfsDetectCycle(neighbor, adj, color, parent);
        if (cycle) {
          return cycle;
        }
      }
    }

    color.set(nodeId, NodeColor.BLACK);
    return null;
  }

  /**
   * Extract cycle path from parent pointers.
   *
   * When we find a back edge from u to v, the cycle is
   * v -> ... -> u -> v
   */
  #extractCycle(fromNodeId: string, toNodeId: string, parent: Map<string, string | null>): string[] {
    const cycle: string[] = [fromNodeId];
    let current: string | null = fromNodeId;

    while (current !== toNodeId && current !== null) {
      current = parent.get(current) ?? null;
      if (current) {
        cycle.unshift(current);
      }
    }

    // Add the closing edge to complete the cycle
    cycle.push(toNodeId);

    return cycle;
  }

  /**
   * Find orphaned tasks - tasks with no dependencies and no dependents.
   *
   * These are isolated nodes in the DAG graph.
   */
  #findOrphanedTasks(adj: Map<string, string[]>, taskIds: string[]): string[] {
    const hasOutgoing = new Set<string>();
    const hasIncoming = new Set<string>();

    for (const [from, toList] of adj.entries()) {
      if (toList.length > 0) {
        hasOutgoing.add(from);
      }
      for (const to of toList) {
        hasIncoming.add(to);
      }
    }

    // Orphaned: no outgoing (deps) AND no incoming (dependents)
    return taskIds.filter((id) => !hasOutgoing.has(id) && !hasIncoming.has(id));
  }

  /**
   * DFS-based path detection.
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
      return false;
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
 * Factory function to create a DAG validator.
 */
export function createDAGValidator(db: FlockDatabase): DAGValidator {
  return new DAGValidator(db);
}
