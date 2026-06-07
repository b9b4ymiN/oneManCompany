/**
 * Flock Core Types
 *
 * Central type definitions for the Flock agent control tower.
 * These types represent the domain model for agent coordination,
 * task management, and policy enforcement.
 */

// ============================================================================
// Task States
// ============================================================================

/**
 * Valid states for a Task in the Flock system.
 *
 * Flow: DRAFT → READY → RUNNING → AGENT_DONE → GATES_RUNNING →
 *       (GATES_FAILED → RUNNING)* → REVIEW_REQUIRED → APPROVED →
 *       MERGED / REJECTED → ARCHIVED
 */
export type TaskState =
  | 'DRAFT'          // Initial state, task being defined
  | 'READY'          // Prerequisites met, ready to start
  | 'RUNNING'        // Agent is actively working on the task
  | 'AGENT_DONE'     // Agent completed work, awaiting gate checks
  | 'GATES_RUNNING'  // Quality gates (tests, lint, etc.) are executing
  | 'GATES_FAILED'   // One or more gates failed, can retry
  | 'REVIEW_REQUIRED' // Awaiting human or automated review
  | 'APPROVED'       // Changes approved, ready to merge
  | 'MERGED'         // Successfully integrated into target branch
  | 'REJECTED'       // Changes rejected, may rework
  | 'ARCHIVED';      // Task completed and archived

/**
 * Valid states for a Run (agent execution instance).
 *
 * Flow: QUEUED → SPAWNING → RUNNING → STOPPING →
 *       SUCCEEDED / FAILED / CANCELLED
 */
export type RunState =
  | 'QUEUED'      // Waiting in execution queue
  | 'SPAWNING'    // Agent process is being created
  | 'RUNNING'     // Agent is actively executing
  | 'STOPPING'    // Graceful shutdown in progress
  | 'SUCCEEDED'   // Completed successfully
  | 'FAILED'      // Completed with error
  | 'CANCELLED';  // Cancelled by user or system

/**
 * Review verdict outcomes.
 */
export type ReviewVerdict =
  | 'APPROVE'           // Changes are approved
  | 'REQUEST_CHANGES'   // Changes need revisions
  | 'ASK_ANOTHER_AGENT' // Delegate to different agent
  | 'REJECT';           // Changes are rejected

// ============================================================================
// Core Domain Entities
// ============================================================================

/**
 * Result of a quality gate execution.
 */
export interface GateResult {
  /** Name/identifier of the gate */
  gate: string;
  /** Execution outcome */
  status: 'passed' | 'failed' | 'skipped';
  /** Process exit code (0 for success) */
  exitCode: number;
  /** Human-readable summary */
  summary: string;
  /** Path to detailed log output */
  logPath: string;
  /** Execution duration in milliseconds */
  duration_ms: number;
}

/**
 * Types of events that occur during agent execution.
 */
export type AgentEventType =
  | 'run_started'         // Agent run began
  | 'agent_spawned'       // Agent process created
  | 'command_executed'    // A command was run
  | 'file_changed'        // A file was modified
  | 'test_failed'         // A test failure occurred
  | 'retry_triggered'     // A retry was initiated
  | 'review_requested'    // Review was requested
  | 'human_approved'      // Human approved the changes
  | 'merged'              // Changes were merged
  | 'gate_passed'         // A quality gate passed
  | 'gate_failed';        // A quality gate failed

/**
 * Configuration for an agent that can be spawned.
 */
export interface AgentConfig {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Agent type (only CLI supported currently) */
  kind: 'cli';
  /** Command to execute */
  command: string;
  /** Arguments to pass to command */
  args: string[];
  /** Write mode or read-only inspection */
  mode?: 'write' | 'readonly';
}

/**
 * A Task represents a unit of work to be completed by an agent.
 */
export interface Task {
  /** Unique identifier */
  id: string;
  /** Project this task belongs to */
  project_id: string;
  /** Brief title */
  title: string;
  /** Detailed description */
  description: string;
  /** Current state in the lifecycle */
  status: TaskState;
  /** Priority level */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Whether human review is required before merge */
  requires_review: boolean;
  /** ISO timestamp of creation */
  created_at: string;
  /** ISO timestamp of last update */
  updated_at: string;
}

/**
 * A Run is a single execution of an agent working on a task.
 */
export interface Run {
  /** Unique identifier */
  id: string;
  /** Task this run is for */
  task_id: string;
  /** Agent performing this run */
  agent_id: string;
  /** Filesystem path for agent workspace */
  workspace_path: string;
  /** Git branch name for this run */
  branch_name: string;
  /** Current execution state */
  status: RunState;
  /** ISO timestamp when run started */
  started_at: string;
  /** ISO timestamp when run ended (if completed) */
  ended_at?: string;
  /** Process exit code (if completed) */
  exit_code?: number;
}

/**
 * A Review is an evaluation of task changes.
 */
export interface Review {
  /** Unique identifier */
  id: string;
  /** Task being reviewed */
  task_id: string;
  /** Who/what performed the review */
  reviewer: string;
  /** Review decision */
  verdict: ReviewVerdict;
  /** Review comments */
  comment: string;
  /** ISO timestamp of review */
  created_at: string;
}

/**
 * A Gate is a quality check that must pass before merge.
 */
export interface Gate {
  /** Unique identifier */
  id: string;
  /** Task this gate belongs to */
  task_id: string;
  /** Gate name/identifier */
  name: string;
  /** Command to execute for gate check */
  command: string;
  /** Current gate status */
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  /** Path to gate output log (if available) */
  output_path?: string;
  /** ISO timestamp of creation */
  created_at: string;
}

/**
 * An Event records something that happened during a run.
 */
export interface Event {
  /** Unique identifier */
  id: string;
  /** Run this event belongs to */
  run_id: string;
  /** Type of event */
  type: AgentEventType;
  /** Event-specific data */
  payload: Record<string, unknown>;
  /** ISO timestamp when event occurred */
  created_at: string;
}

/**
 * A Project represents a codebase being managed by Flock.
 */
export interface Project {
  /** Unique identifier */
  id: string;
  /** Project name */
  name: string;
  /** Local filesystem path to repository */
  repo_path: string;
  /** Default branch name (e.g., 'main') */
  default_branch: string;
  /** ISO timestamp of creation */
  created_at: string;
}

// ============================================================================
// State Machine Types
// ============================================================================

/**
 * Record of a state transition.
 */
export interface TransitionRecord {
  /** Previous state */
  from: string;
  /** New state */
  to: string;
  /** ISO timestamp of transition */
  at: string;
  /** Optional reason for transition */
  reason?: string;
}

/**
 * Context provided when transitioning states.
 */
export interface TaskTransitionContext {
  reason?: string;
  gateResults?: GateResult[];
  reviewAvailable?: boolean;
  humanOverride?: boolean;
}

/**
 * Context provided when transitioning run states.
 */
export interface RunTransitionContext {
  reason?: string;
  exitCode?: number;
  timeout?: boolean;
}

/**
 * Snapshot of task state machine state.
 */
export interface TaskSnapshot {
  /** Current state */
  current_state: TaskState;
  /** Transition history */
  history: TransitionRecord[];
}

/**
 * Snapshot of run state machine state.
 */
export interface RunSnapshot {
  /** Current state */
  current_state: RunState;
  /** Transition history */
  history: TransitionRecord[];
  /** Exit code if completed */
  exit_code?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Agent configuration from YAML config.
 */
export interface ConfigAgent {
  type: 'cli';
  command: string;
  args: string[];
  mode?: 'write' | 'readonly';
}

/**
 * Gate configuration from YAML config.
 */
export interface ConfigGate {
  command: string;
}

/**
 * Policy settings from YAML config.
 */
export interface ConfigPolicies {
  /** Require human approval before merging */
  require_human_approval_before_merge: boolean;
  /** Prevent direct writes to main branch */
  forbid_direct_main_branch_write: boolean;
  /** Require diff summary in agent output */
  require_diff_summary: boolean;
  /** Require test coverage for code changes */
  require_tests_for_code_change: boolean;
  /** Preserve workspaces after failure */
  preserve_failed_workspaces: boolean;
  /** Maximum concurrent agent runs */
  max_parallel_runs: number;
  /** Default timeout in minutes */
  default_timeout_minutes: number;
}

/**
 * Root Flock configuration structure.
 */
export interface FlockConfig {
  /** Configured agents by name */
  agents: Record<string, ConfigAgent>;
  /** Configured quality gates by name */
  gates: Record<string, ConfigGate>;
  /** Policy settings */
  policies: ConfigPolicies;
  /** Retry policy settings */
  retry?: RetryPolicy;
  /** Reviewer policy settings */
  review?: ReviewerPolicy;
}

// ============================================================================
// Retry Types
// ============================================================================

/**
 * Retry policy for auto-retry behavior.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Auto-retry when quality gates fail */
  retryOnGateFailure: boolean;
  /** Auto-retry when agent exits non-zero */
  retryOnAgentCrash: boolean;
  /** Delay between retries in milliseconds (default: 5000) */
  retryDelayMs: number;
  /** Request human review after exhausting retries */
  escalateToHumanAfterMaxRetries: boolean;
  /** Agents allowed for retry (empty = any) */
  allowedAgents?: string[];
}

// ============================================================================
// Reviewer Types
// ============================================================================

/**
 * Configuration for a reviewer agent.
 */
export interface ReviewerConfig {
  /** The reviewer agent ID */
  agentId: string;
  /** Single reviewer or consensus panel */
  mode: 'single' | 'consensus';
  /** For consensus: how many approvals needed */
  requiredApprovals: number;
  /** If N reviewers reject, auto-reject */
  autoRejectThreshold: number;
}

/**
 * Reviewer assignment tracking.
 */
export interface ReviewerAssignment {
  /** Task being reviewed */
  taskId: string;
  /** Reviewer configuration */
  reviewerConfig: ReviewerConfig;
  /** Reviews collected so far */
  reviews: Review[];
  /** Whether consensus has been reached */
  consensusReached: boolean;
  /** Current verdict */
  verdict: 'approved' | 'rejected' | 'pending';
}

/**
 * Reviewer policy from config.
 */
export interface ReviewerPolicy {
  /** Default reviewer mode */
  mode: 'single' | 'consensus';
  /** Required approvals for consensus */
  requiredApprovals: number;
  /** Auto-reject threshold */
  autoRejectThreshold: number;
}

/**
 * Result of a consensus check.
 */
export interface ConsensusResult {
  /** Whether consensus was reached */
  reached: boolean;
  /** Final verdict based on consensus */
  verdict: 'approved' | 'rejected' | 'pending';
  /** Number of approval reviews */
  approvalCount: number;
  /** Number of rejection reviews */
  rejectionCount: number;
  /** Number of pending reviews */
  pendingCount: number;
  /** Total number of reviews */
  totalReviews: number;
}

// ============================================================================
// Scheduler Types
// ============================================================================

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
 * Information about an agent's current state.
 */
export interface AgentInfo {
  /** Unique agent identifier */
  id: string;
  /** Agent configuration */
  config: AgentConfig;
  /** Number of currently active runs for this agent */
  activeRuns: number;
  /** Whether agent is available for new work */
  isAvailable: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for task state machine errors.
 */
export type TaskStateErrorCode =
  | 'INVALID_TRANSITION'
  | 'PRECONDITION_FAILED'
  | 'GATES_NOT_PASSED'
  | 'REVIEW_REQUIRED';

/**
 * Error codes for run state machine errors.
 */
export type RunStateErrorCode =
  | 'INVALID_TRANSITION'
  | 'PRECONDITION_FAILED'
  | 'PROCESS_ERROR';

/**
 * Base class for task state errors.
 */
export class TaskStateError extends Error {
  constructor(
    readonly code: TaskStateErrorCode,
    message: string,
    readonly details: unknown = {}
  ) {
    super(message);
    this.name = 'TaskStateError';
  }
}

/**
 * Base class for run state errors.
 */
export class RunStateError extends Error {
  constructor(
    readonly code: RunStateErrorCode,
    message: string,
    readonly details: unknown = {}
  ) {
    super(message);
    this.name = 'RunStateError';
  }
}

/**
 * Error codes for general Flock errors.
 */
export type FlockErrorCode =
  | 'WORKSPACE_CREATE_FAILED'
  | 'WORKSPACE_REMOVE_FAILED'
  | 'WORKTREE_EXISTS'
  | 'BRANCH_EXISTS'
  | 'BRANCH_NOT_FOUND'
  | 'GIT_COMMAND_FAILED'
  | 'DIRTY_STATE'
  | 'INVALID_PATH'
  | 'NOT_A_REPOSITORY'
  | 'CONFIG_NOT_FOUND'
  | 'DATABASE_ERROR';

/**
 * Base class for general Flock errors.
 */
export class FlockError extends Error {
  constructor(
    readonly code: FlockErrorCode,
    message: string,
    readonly details: unknown = {}
  ) {
    super(message);
    this.name = 'FlockError';
  }
}
