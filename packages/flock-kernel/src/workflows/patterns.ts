/**
 * Flock Workflow Patterns
 *
 * Reusable workflow patterns for multi-agent task orchestration.
 * Each pattern defines a structure for how tasks and agents flow together.
 */

import type { Task } from '../types';

/**
 * Sequential Chain Pattern
 *
 * Task A → Task B → Task C
 *
 * Creates tasks with dependency chain where each task depends on the previous.
 * Each task waits for the previous task to be MERGED before starting.
 */
export interface SequentialChain {
  /** Ordered list of tasks to execute sequentially */
  tasks: Array<{
    /** Task title/identifier */
    title: string;
    /** Agent ID to execute the task */
    agentId: string;
    /** Optional task description */
    description?: string;
    /** Optional priority */
    priority?: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

/**
 * Parallel Fan-Out Pattern
 *
 * Task A → [Task B, Task C, Task D]
 *
 * Creates multiple tasks that all depend on a single source task.
 * All fan-out tasks can run in parallel once the source completes.
 */
export interface ParallelFanOut {
  /** Source task that fans out to multiple targets */
  sourceTask: {
    /** Source task title */
    title: string;
    /** Agent ID for source task */
    agentId: string;
    /** Optional source task description */
    description?: string;
  };
  /** Target tasks that run in parallel after source completes */
  targets: Array<{
    /** Target task title */
    title: string;
    /** Agent ID to execute the task */
    agentId: string;
    /** Optional task description */
    description?: string;
    /** Optional priority */
    priority?: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

/**
 * Fan-In Pattern
 *
 * [Task B, Task C, Task D] → Task E
 *
 * Creates a task that depends on multiple source tasks.
 * The fan-in task only starts when ALL sources are complete (MERGED/APPROVED).
 */
export interface FanIn {
  /** Source tasks that must all complete before fan-in task starts */
  sourceTasks: Array<{
    /** Source task title */
    title: string;
    /** Agent ID to execute the task */
    agentId: string;
    /** Optional task description */
    description?: string;
    /** Optional priority */
    priority?: 'low' | 'medium' | 'high' | 'critical';
  }>;
  /** Target task that starts after all sources complete */
  target: {
    /** Target task title */
    title: string;
    /** Agent ID to execute the task */
    agentId: string;
    /** Optional task description */
    description?: string;
    /** Optional priority */
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
}

/**
 * Review Pipeline Pattern
 *
 * Implement → Test → Review → Merge
 *
 * Classic pattern: one agent implements, another tests, reviewer reviews.
 * Auto-creates dependency chain with review gate.
 */
export interface ReviewPipeline {
  /** Implementation phase */
  implement: {
    /** Agent ID to implement */
    agentId: string;
    /** Task title */
    title: string;
    /** Task description */
    description: string;
    /** Optional priority */
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
  /** Testing phase */
  test: {
    /** Agent ID to run tests */
    agentId: string;
    /** Optional test description */
    description?: string;
  };
  /** Review phase */
  review: {
    /** Agent ID(s) for review (comma-separated for multiple reviewers) */
    agentId: string;
    /** Number of required approvals */
    requiredApprovals?: number;
    /** Auto-reject threshold (if rejections >= threshold, auto-reject) */
    autoRejectThreshold?: number;
  };
}

/**
 * Workflow Execution Result
 *
 * Result of executing a workflow pattern.
 */
export interface WorkflowResult {
  /** Task IDs created by the workflow */
  taskIds: string[];
  /** Workflow execution status */
  status: 'created' | 'partial' | 'failed';
  /** Error details if partial or failed */
  error?: string;
  /** Tasks created (partial success) */
  tasks?: Task[];
}

/**
 * Workflow Configuration
 *
 * Common configuration for workflow execution.
 */
export interface WorkflowConfig {
  /** Project ID to create tasks under */
  projectId: string;
  /** Whether to automatically start runs for created tasks */
  autoStart?: boolean;
  /** Whether to queue runs when parallel limit is reached */
  queueEnabled?: boolean;
}
