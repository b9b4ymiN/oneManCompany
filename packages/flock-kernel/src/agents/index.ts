/**
 * Flock Agents Module
 *
 * Agent adapter implementations and spawner for managing agent lifecycle.
 */

// ============================================================================
// Agent Adapter Interface
// ============================================================================

export type {
  AgentRunInput,
  AgentEvent,
  AgentRunResult,
  AgentStreamEventType,
} from './adapter';

export type { AgentAdapter } from './adapter';

// ============================================================================
// CLI Agent Adapter
// ============================================================================

export { CLIAgentAdapter, createCLIAgentAdapter } from './cli-agent';

// ============================================================================
// Agent Spawner
// ============================================================================

export type { SpawnerConfig } from './spawner';

export { AgentSpawner, createAgentSpawner } from './spawner';
