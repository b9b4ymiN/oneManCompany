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
