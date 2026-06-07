/**
 * Flock Agent Adapter Interface
 *
 * Defines the contract for spawning and managing agent processes.
 * Agents execute in isolated worktrees and stream events back to the system.
 */

import type { AgentConfig } from '../types';

// ============================================================================
// Agent Spawning Types
// ============================================================================

/**
 * Input parameters for spawning an agent.
 */
export interface AgentRunInput {
  /** Unique task identifier */
  taskId: string;
  /** Unique run identifier */
  runId: string;
  /** Workspace path for the agent to work in */
  workspacePath: string;
  /** Git branch name for this run */
  branch: string;
  /** Prompt/task description for the agent */
  prompt: string;
  /** Timeout in milliseconds */
  timeout_ms: number;
}

/**
 * Event types that can be emitted by an agent during execution.
 */
export type AgentStreamEventType =
  | 'stdout'        // Standard output from agent
  | 'stderr'        // Standard error from agent
  | 'exit'          // Agent process exited
  | 'error'         // Error occurred during execution
  | 'file_changed'  // A file was modified by the agent
  | 'agent_spawned'; // Agent process was spawned

/**
 * An event emitted during agent execution.
 */
export interface AgentEvent {
  /** Event type */
  type: AgentStreamEventType;
  /** Event data (content of stdout/stderr, error message, etc.) */
  data: string;
  /** ISO timestamp when event occurred */
  timestamp: string;
}

/**
 * Result of an agent run.
 */
export interface AgentRunResult {
  /** Process exit code (null if process was killed) */
  exitCode: number | null;
  /** Complete stdout output */
  stdout: string;
  /** Complete stderr output */
  stderr: string;
  /** Duration in milliseconds */
  duration_ms: number;
  /** Whether the run timed out */
  timedOut: boolean;
}

// ============================================================================
// Agent Adapter Interface
// ============================================================================

/**
 * Contract for agent adapters.
 *
 * Adapters are responsible for spawning agent processes,
 * streaming execution events, and managing process lifecycle.
 */
export interface AgentAdapter {
  /** Unique adapter identifier */
  readonly id: string;
  /** Agent configuration */
  readonly config: AgentConfig;

  /**
   * Spawn the agent with the given input.
   *
   * @param input - Run parameters
   * @returns Async iterable of events during execution
   */
  spawn(input: AgentRunInput): AsyncIterable<AgentEvent>;

  /**
   * Stop a running agent by run ID.
   *
   * @param runId - Run identifier to stop
   * @returns Promise that resolves when agent is stopped
   */
  stop(runId: string): Promise<void>;
}
