/**
 * Flock Task Dependencies Commands
 *
 * Manage task dependencies for the Flock system.
 */

import { Command } from 'commander';
import { resolve } from 'node:path';
import { createDatabase } from '@onemancompany/flock-kernel';
import { safeEq, safeDesc } from '../drizzle-helpers';

/**
 * Find the Flock database path.
 */
function findFlockDbPath(): string {
  return resolve(process.cwd(), '.flock', 'flock.db');
}

/**
 * Add dependency action.
 */
function depsAddAction(taskId: string, dependsOnTaskId: string): void {
  const db = createDatabase(findFlockDbPath());

  // Verify both tasks exist
  const [task, dependsOnTask] = [
    db.db.select().from(db.schema.tasks).where(safeEq(db.schema.tasks, 'id', taskId)).get(),
    db.db
      .select()
      .from(db.schema.tasks)
      .where(safeEq(db.schema.tasks, 'id', dependsOnTaskId))
      .get(),
  ];

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  if (!dependsOnTask) {
    console.error(`Dependency task not found: ${dependsOnTaskId}`);
    process.exit(1);
  }

  // Check for circular dependency
  const wouldCreateCycle = checkCircularDependency(db, taskId, dependsOnTaskId);
  if (wouldCreateCycle) {
    console.error(`Error: Adding dependency would create a cycle: ${taskId} -> ${dependsOnTaskId}`);
    process.exit(1);
  }

  // Check if dependency already exists
  const existing = db.db
    .select()
    .from(db.schema.task_dependencies)
    .where(
      (db as any).and(
        safeEq(db.schema.task_dependencies, 'task_id', taskId),
        safeEq(db.schema.task_dependencies, 'depends_on_task_id', dependsOnTaskId)
      )
    )
    .get();

  if (existing) {
    console.log(`Dependency already exists: ${taskId} -> ${dependsOnTaskId}`);
    return;
  }

  // Add the dependency
  (db.db.insert(db.schema.task_dependencies).values as any)({
    task_id: taskId,
    depends_on_task_id: dependsOnTaskId,
  }).run();

  console.log(`✓ Dependency added: ${taskId} -> ${dependsOnTaskId}`);
}

/**
 * Remove dependency action.
 */
function depsRemoveAction(taskId: string, dependsOnTaskId: string): void {
  const db = createDatabase(findFlockDbPath());

  const result = db.db
    .delete(db.schema.task_dependencies)
    .where(
      (db as any).and(
        safeEq(db.schema.task_dependencies, 'task_id', taskId),
        safeEq(db.schema.task_dependencies, 'depends_on_task_id', dependsOnTaskId)
      )
    )
    .run();

  if (result.changes === 0) {
    console.error(`Dependency not found: ${taskId} -> ${dependsOnTaskId}`);
    process.exit(1);
  }

  console.log(`✓ Dependency removed: ${taskId} -> ${dependsOnTaskId}`);
}

/**
 * List dependencies for a task.
 */
function depsListAction(taskId: string): void {
  const db = createDatabase(findFlockDbPath());

  const task = db.db.select().from(db.schema.tasks).where(safeEq(db.schema.tasks, 'id', taskId)).get();

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  // Get direct dependencies
  const dependencies = db.db
    .select()
    .from(db.schema.task_dependencies)
    .where(safeEq(db.schema.task_dependencies, 'task_id', taskId))
    .all();

  if (dependencies.length === 0) {
    console.log(`Task ${taskId} has no dependencies.`);
    return;
  }

  console.log(`Dependencies for ${taskId}:`);
  for (const dep of dependencies) {
    const depTask = db.db
      .select()
      .from(db.schema.tasks)
      .where(safeEq(db.schema.tasks, 'id', dep.depends_on_task_id))
      .get();

    if (depTask) {
      const statusIcon = getStatusIcon(depTask.status as any);
      console.log(`  ${statusIcon} ${dep.depends_on_task_id}: ${depTask.title} (${depTask.status})`);
    }
  }
}

/**
 * Show full DAG for a project.
 */
function depsGraphAction(projectId: string): void {
  const db = createDatabase(findFlockDbPath());

  const project = db.db
    .select()
    .from(db.schema.projects)
    .where(safeEq(db.schema.projects, 'id', projectId))
    .get();

  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  // Get all tasks for the project
  const tasks = db.db
    .select()
    .from(db.schema.tasks)
    .where(safeEq(db.schema.tasks, 'project_id', projectId))
    .all();

  if (tasks.length === 0) {
    console.log(`Project ${project.name} has no tasks.`);
    return;
  }

  console.log(`Dependency graph for project: ${project.name}`);
  console.log();

  // Group by status
  const byStatus: Record<string, typeof tasks> = {};
  for (const task of tasks) {
    if (!byStatus[task.status]) {
      byStatus[task.status] = [];
    }
    byStatus[task.status].push(task);
  }

  // Show tasks by status
  const statusOrder = ['DRAFT', 'READY', 'RUNNING', 'REVIEW_REQUIRED', 'APPROVED', 'MERGED', 'REJECTED'];
  for (const status of statusOrder) {
    const statusTasks = byStatus[status];
    if (statusTasks && statusTasks.length > 0) {
      console.log(`${status}:`);
      for (const task of statusTasks) {
        console.log(`  ${task.id}: ${task.title}`);

        // Show dependencies
        const deps = db.db
          .select()
          .from(db.schema.task_dependencies)
          .where(safeEq(db.schema.task_dependencies, 'task_id', task.id))
          .all();

        if (deps.length > 0) {
          console.log(`    depends on: ${deps.map((d) => d.depends_on_task_id).join(', ')}`);
        }
      }
    }
  }
}

/**
 * Check if adding a dependency would create a cycle.
 */
function checkCircularDependency(
  db: ReturnType<typeof createDatabase>,
  taskId: string,
  dependsOnTaskId: string
): boolean {
  // Build adjacency map
  const adj = new Map<string, string[]>();
  const allDeps = db.db.select().from(db.schema.task_dependencies).all();

  for (const dep of allDeps) {
    if (!adj.has(dep.task_id)) {
      adj.set(dep.task_id, []);
    }
    adj.get(dep.task_id)!.push(dep.depends_on_task_id);
  }

  // Add the new edge
  if (!adj.has(taskId)) {
    adj.set(taskId, []);
  }
  adj.get(taskId)!.push(dependsOnTaskId);

  // Check if there's a path from dependsOnTaskId back to taskId
  return hasPath(adj, dependsOnTaskId, taskId, new Set());
}

/**
 * DFS-based path detection.
 */
function hasPath(
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

  const neighbors = adj.get(start) || [];
  for (const neighbor of neighbors) {
    if (hasPath(adj, neighbor, target, visited)) {
      return true;
    }
  }

  return false;
}

/**
 * Get status icon for a task status.
 */
function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    DRAFT: '📝',
    READY: '✅',
    RUNNING: '🏃',
    REVIEW_REQUIRED: '👀',
    APPROVED: '✓',
    MERGED: '🔀',
    REJECTED: '✗',
  };
  return icons[status] || '❓';
}

/**
 * Export dependency commands.
 */
export const depsCommands = [
  new Command('add')
    .description('Add a dependency between tasks')
    .argument('<taskId>', 'Task ID (e.g., task-002)')
    .argument('<dependsOnTaskId>', 'Task ID this depends on (e.g., task-001)')
    .action(depsAddAction),

  new Command('remove')
    .description('Remove a dependency between tasks')
    .argument('<taskId>', 'Task ID (e.g., task-002)')
    .argument('<dependsOnTaskId>', 'Task ID to remove dependency on (e.g., task-001)')
    .action(depsRemoveAction),

  new Command('list')
    .description('List dependencies for a task')
    .argument('<taskId>', 'Task ID')
    .action(depsListAction),

  new Command('graph')
    .description('Show full dependency graph for a project')
    .argument('<projectId>', 'Project ID')
    .action(depsGraphAction),
];
