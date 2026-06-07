import { safeEq, safeDesc } from '../drizzle-helpers';
/**
 * Flock Task Commands
 *
 * Task management commands for Flock.
 */

import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createDatabase } from '@onemancompany/flock-kernel';
import { eq, desc } from 'drizzle-orm';

/**
 * Find the Flock database path.
 */
function findFlockDbPath(): string {
  const path = resolve(process.cwd(), '.flock', 'flock.db');
  return path;
}

/**
 * Generate a task ID (e.g., task-001, task-002).
 */
function generateTaskId(count: number): string {
  return `task-${String(count + 1).padStart(3, '0')}`;
}

/**
 * Create a task action.
 */
function taskCreateAction(
  title: string,
  options: {
    description?: string;
    priority?: string;
    requiresReview?: boolean;
    projectId?: string;
  }
): void {
  const dbPath = findFlockDbPath();
  const db = createDatabase(dbPath);

  // Get or find project
  let projectId = options.projectId;

  if (!projectId) {
    // Try to find project by current path
    const currentPath = resolve(process.cwd());
    const projects = db.db
      .select()
      .from(db.schema.projects)
      .all();

    // Find project that contains current path
    const matchingProject = projects.find((p) => {
      return currentPath.startsWith(p.repo_path);
    });

    if (!matchingProject) {
      console.error('No project found for current directory. Specify --project-id or run `flock project add .`');
      process.exit(1);
    }

    projectId = matchingProject.id;
  }

  // Verify project exists
  const project = db.db
    .select()
    .from(db.schema.projects)
    .where(safeEq(db.schema.projects, "id", projectId))
    .get();

  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  // Count existing tasks for this project to generate ID
  const taskCount = db.db
    .select()
    .from(db.schema.tasks)
    .where(safeEq(db.schema.tasks, "project_id", projectId))
    .all().length;

  const taskId = generateTaskId(taskCount);
  const now = new Date().toISOString();

  // Parse priority
  const priority = options.priority || 'medium';
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  if (!validPriorities.includes(priority)) {
    console.error(`Invalid priority: ${priority}. Must be one of: ${validPriorities.join(', ')}`);
    process.exit(1);
  }

  // Create task
  (db.db.insert(db.schema.tasks).values as any)({
    id: taskId,
    project_id: projectId,
    title,
    description: options.description || '',
    status: 'DRAFT',
    priority: priority as 'low' | 'medium' | 'high' | 'critical',
    requires_review: options.requiresReview ?? true,
    created_at: now,
    updated_at: now,
  }).run();

  console.log(`✓ Task created: ${taskId}`);
  console.log(`  Title: ${title}`);
  console.log(`  Project: ${project.name} (${project.id})`);
  console.log(`  Priority: ${priority}`);
  console.log(`  Status: DRAFT`);
  console.log(`  Requires review: ${options.requiresReview ?? true ? 'yes' : 'no'}`);
}

/**
 * Task create command.
 */
export const taskCreateCommand = new Command('create')
  .description('Create a new task')
  .argument('<title>', 'Task title')
  .option('-d, --description <text>', 'Task description')
  .option('-p, --priority <level>', 'Priority level (low|medium|high|critical)', 'medium')
  .option('--no-review', 'Do not require review before merge')
  .option('--project-id <id>', 'Project ID (auto-detected if not specified)')
  .action(taskCreateAction);
