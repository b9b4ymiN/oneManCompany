/**
 * Flock Kernel
 *
 * Agent control tower for the Flock multi-agent system.
 * Provides types, state machines, database schema, and configuration.
 */

// ============================================================================
// Types
// ============================================================================

export * from './types';

// ============================================================================
// Zod Schemas
// ============================================================================

export * from './schemas';

// ============================================================================
// State Machines
// ============================================================================

export { TaskStateMachine } from './task-state-machine';
export { RunStateMachine } from './run-state-machine';

// ============================================================================
// Database
// ============================================================================

export {
  createDatabase,
  getDatabase,
  closeDatabase,
  schema,
} from './db/client';

export type { FlockDatabase } from './db/client';

export * from './db/schema';

// ============================================================================
// Configuration
// ============================================================================

export {
  loadConfig,
  loadConfigSync,
  getDefaultConfig,
  defaultConfig,
} from './config';

export type { ConfigError, ConfigErrorCode } from './config';

// ============================================================================
// Workspace
// ============================================================================

export * from './workspace';

// ============================================================================
// Agents
// ============================================================================

export * from './agents';

// ============================================================================
// Gates
// ============================================================================

export * from './gates';

// ============================================================================
// Orchestrator
// ============================================================================

export { FlockOrchestrator, createOrchestrator } from './orchestrator';
export type { StartRunConfig } from './orchestrator';

// ============================================================================
// DAG Module
// ============================================================================

export * from './dag';

// ============================================================================
// Scheduler
// ============================================================================

export {
  RunQueue,
  createRunQueue,
  AgentPool,
  createAgentPool,
  ParallelScheduler,
  createParallelScheduler,
  type QueueEntry,
  type QueueStatus,
  type AgentInfo,
  type ParallelSchedulerConfig,
  PRIORITY_VALUES,
  DEFAULT_PRIORITY,
} from './scheduler';

// ============================================================================
// Retry Module
// ============================================================================

export { RetryEngine, createRetryEngine } from './retry';
export type { RetryDecision, RetryAttempt } from './retry';

// ============================================================================
// Reviewer Module
// ============================================================================

export { ReviewerEngine, createReviewerEngine } from './reviewer';
export type { ConsensusResult, ReviewerSpawnConfig, ParsedReviewOutput } from './reviewer';

// ============================================================================
// Workflows Module
// ============================================================================

export { WorkflowRunner, createWorkflowRunner } from './workflows';
export type {
  SequentialChain,
  ParallelFanOut,
  FanIn,
  ReviewPipeline,
  WorkflowResult,
  WorkflowConfig,
} from './workflows';

// ============================================================================
// Observability
// ============================================================================

export {
  FlockEventLogger,
  createEventLogger,
} from './observability/event-log';
export type { TimelineEntry, RunTimeline } from './observability/event-log';

export {
  auditLog,
  readAuditLog,
  queryAuditByAction,
  queryAuditByActor,
  queryAuditByTarget,
} from './observability/audit';
export type { AuditLogEntry } from './observability/audit';
