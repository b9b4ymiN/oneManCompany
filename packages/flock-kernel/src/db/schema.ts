/**
 * Flock Database Schema
 *
 * Drizzle ORM SQLite schema for the Flock control tower.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// Projects
// ============================================================================

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repo_path: text('repo_path').notNull(),
  default_branch: text('default_branch').notNull().default('main'),
  created_at: text('created_at').notNull(),
});

// ============================================================================
// Agents
// ============================================================================

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // 'cli'
  command: text('command').notNull(),
  config_json: text('config_json').notNull(), // JSON string of AgentConfig
  created_at: text('created_at').notNull(),
});

// ============================================================================
// Tasks
// ============================================================================

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  project_id: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull(), // TaskState enum
  priority: text('priority').notNull(), // 'low', 'medium', 'high', 'critical'
  requires_review: integer('requires_review', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

// ============================================================================
// Task Dependencies
// ============================================================================

export const task_dependencies = sqliteTable('task_dependencies', {
  task_id: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  depends_on_task_id: text('depends_on_task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
});

// ============================================================================
// Runs
// ============================================================================

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  task_id: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  agent_id: text('agent_id')
    .notNull()
    .references(() => agents.id),
  workspace_path: text('workspace_path').notNull(),
  branch_name: text('branch_name').notNull(),
  status: text('status').notNull(), // RunState enum
  started_at: text('started_at').notNull(),
  ended_at: text('ended_at'),
  exit_code: integer('exit_code'),
});

// ============================================================================
// Events
// ============================================================================

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  run_id: text('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // AgentEventType enum
  payload_json: text('payload_json').notNull(), // JSON string
  created_at: text('created_at').notNull(),
});

// ============================================================================
// Gates
// ============================================================================

export const gates = sqliteTable('gates', {
  id: text('id').primaryKey(),
  task_id: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  command: text('command').notNull(),
  status: text('status').notNull(), // 'pending', 'running', 'passed', 'failed', 'skipped'
  output_path: text('output_path'),
  created_at: text('created_at').notNull(),
});

// ============================================================================
// Reviews
// ============================================================================

export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  task_id: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  reviewer: text('reviewer').notNull(),
  verdict: text('verdict').notNull(), // ReviewVerdict enum
  comment: text('comment').notNull(),
  created_at: text('created_at').notNull(),
});

// ============================================================================
// Type Exports
// ============================================================================

// Database-specific types (prefixed with 'Db' to distinguish from domain types)
export type DbProject = typeof projects.$inferSelect;
export type NewDbProject = typeof projects.$inferInsert;

export type DbAgent = typeof agents.$inferSelect;
export type NewDbAgent = typeof agents.$inferInsert;

export type DbTask = typeof tasks.$inferSelect;
export type NewDbTask = typeof tasks.$inferInsert;

export type DbTaskDependency = typeof task_dependencies.$inferSelect;
export type NewDbTaskDependency = typeof task_dependencies.$inferInsert;

export type DbRun = typeof runs.$inferSelect;
export type NewDbRun = typeof runs.$inferInsert;

export type DbEvent = typeof events.$inferSelect;
export type NewDbEvent = typeof events.$inferInsert;

export type DbGate = typeof gates.$inferSelect;
export type NewDbGate = typeof gates.$inferInsert;

export type DbReview = typeof reviews.$inferSelect;
export type NewDbReview = typeof reviews.$inferSelect;
