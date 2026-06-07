/**
 * Flock Workflows Module
 *
 * Reusable workflow patterns for multi-agent orchestration.
 */

export type {
  SequentialChain,
  ParallelFanOut,
  FanIn,
  ReviewPipeline,
  WorkflowResult,
  WorkflowConfig,
} from './patterns';

export { WorkflowRunner, createWorkflowRunner } from './workflow-runner';
