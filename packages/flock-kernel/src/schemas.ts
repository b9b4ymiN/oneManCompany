/**
 * Flock Zod Schemas
 *
 * Validation schemas for all Flock types using Zod.
 * These provide runtime validation and type safety.
 */

import { z } from 'zod';

// ============================================================================
// Enum Schemas
// ============================================================================

export const TaskStateSchema = z.enum([
  'DRAFT',
  'READY',
  'RUNNING',
  'AGENT_DONE',
  'GATES_RUNNING',
  'GATES_FAILED',
  'REVIEW_REQUIRED',
  'APPROVED',
  'MERGED',
  'REJECTED',
  'ARCHIVED',
]);

export const RunStateSchema = z.enum([
  'QUEUED',
  'SPAWNING',
  'RUNNING',
  'STOPPING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

export const ReviewVerdictSchema = z.enum([
  'APPROVE',
  'REQUEST_CHANGES',
  'ASK_ANOTHER_AGENT',
  'REJECT',
]);

export const AgentEventTypeSchema = z.enum([
  'run_started',
  'agent_spawned',
  'command_executed',
  'file_changed',
  'test_failed',
  'retry_triggered',
  'review_requested',
  'human_approved',
  'merged',
  'gate_passed',
  'gate_failed',
]);

// ============================================================================
// Common Schemas
// ============================================================================

export const isoTimestampSchema = z.string().datetime({
  message: 'Must be a valid ISO 8601 timestamp',
});

export const prioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const gateStatusSchema = z.enum(['pending', 'running', 'passed', 'failed', 'skipped']);

export const gateResultStatusSchema = z.enum(['passed', 'failed', 'skipped']);

// ============================================================================
// Entity Schemas
// ============================================================================

export const AgentConfigSchema = z.object({
  id: z.string().min(1, 'Agent ID is required'),
  name: z.string().min(1, 'Agent name is required'),
  kind: z.literal('cli'),
  command: z.string().min(1, 'Command is required'),
  args: z.array(z.string()).default([]),
  mode: z.enum(['write', 'readonly']).optional(),
});

export const GateResultSchema = z.object({
  gate: z.string().min(1, 'Gate name is required'),
  status: gateResultStatusSchema,
  exitCode: z.number().int(),
  summary: z.string(),
  logPath: z.string(),
  duration_ms: z.number().int().nonnegative(),
});

export const TaskSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string(),
  status: TaskStateSchema,
  priority: prioritySchema,
  requires_review: z.boolean().default(false),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const RunSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().uuid(),
  agent_id: z.string().min(1, 'Agent ID is required'),
  workspace_path: z.string().min(1, 'Workspace path is required'),
  branch_name: z.string().min(1, 'Branch name is required'),
  status: RunStateSchema,
  started_at: isoTimestampSchema,
  ended_at: isoTimestampSchema.optional(),
  exit_code: z.number().int().optional(),
});

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().uuid(),
  reviewer: z.string().min(1, 'Reviewer is required'),
  verdict: ReviewVerdictSchema,
  comment: z.string(),
  created_at: isoTimestampSchema,
});

export const GateSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().uuid(),
  name: z.string().min(1, 'Gate name is required'),
  command: z.string().min(1, 'Command is required'),
  status: gateStatusSchema,
  output_path: z.string().optional(),
  created_at: isoTimestampSchema,
});

export const EventSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  type: AgentEventTypeSchema,
  payload: z.record(z.unknown()),
  created_at: isoTimestampSchema,
});

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Project name is required').max(100),
  repo_path: z.string().min(1, 'Repo path is required'),
  default_branch: z.string().min(1, 'Default branch is required').default('main'),
  created_at: isoTimestampSchema,
});

// ============================================================================
// State Machine Schemas
// ============================================================================

export const TransitionRecordSchema = z.object({
  from: z.string(),
  to: z.string(),
  at: isoTimestampSchema,
  reason: z.string().optional(),
});

export const TaskTransitionContextSchema = z.object({
  reason: z.string().optional(),
  gateResults: z.array(GateResultSchema).optional(),
  reviewAvailable: z.boolean().optional(),
  humanOverride: z.boolean().optional(),
});

export const RunTransitionContextSchema = z.object({
  reason: z.string().optional(),
  exitCode: z.number().int().optional(),
  timeout: z.boolean().optional(),
});

export const TaskSnapshotSchema = z.object({
  current_state: TaskStateSchema,
  history: z.array(TransitionRecordSchema),
});

export const RunSnapshotSchema = z.object({
  current_state: RunStateSchema,
  history: z.array(TransitionRecordSchema),
  exit_code: z.number().int().optional(),
});

// ============================================================================
// Configuration Schemas
// ============================================================================

export const ConfigAgentSchema = z.object({
  type: z.literal('cli'),
  command: z.string().min(1, 'Command is required'),
  args: z.array(z.string()).default([]),
  mode: z.enum(['write', 'readonly']).optional(),
});

export const ConfigGateSchema = z.object({
  command: z.string().min(1, 'Command is required'),
});

export const ConfigPoliciesSchema = z.object({
  require_human_approval_before_merge: z.boolean().default(true),
  forbid_direct_main_branch_write: z.boolean().default(true),
  require_diff_summary: z.boolean().default(true),
  require_tests_for_code_change: z.boolean().default(true),
  preserve_failed_workspaces: z.boolean().default(true),
  max_parallel_runs: z.number().int().positive().default(4),
  default_timeout_minutes: z.number().int().positive().default(60),
});

export const FlockConfigSchema = z.object({
  agents: z.record(z.string(), ConfigAgentSchema),
  gates: z.record(z.string(), ConfigGateSchema),
  policies: ConfigPoliciesSchema,
});

// ============================================================================
// Type Inference Exports
// ============================================================================

export type TaskStateInput = z.infer<typeof TaskStateSchema>;
export type RunStateInput = z.infer<typeof RunStateSchema>;
export type ReviewVerdictInput = z.infer<typeof ReviewVerdictSchema>;
export type AgentEventTypeInput = z.infer<typeof AgentEventTypeSchema>;
export type AgentConfigInput = z.infer<typeof AgentConfigSchema>;
export type GateResultInput = z.infer<typeof GateResultSchema>;
export type TaskInput = z.infer<typeof TaskSchema>;
export type RunInput = z.infer<typeof RunSchema>;
export type ReviewInput = z.infer<typeof ReviewSchema>;
export type GateInput = z.infer<typeof GateSchema>;
export type EventInput = z.infer<typeof EventSchema>;
export type ProjectInput = z.infer<typeof ProjectSchema>;
export type FlockConfigInput = z.infer<typeof FlockConfigSchema>;
