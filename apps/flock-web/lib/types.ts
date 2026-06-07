/**
 * Flock Web Types
 *
 * Re-exports core types from flock-kernel for web client use.
 */

export type {
  TaskState,
  RunState,
  ReviewVerdict,
  Task,
  Run,
  Review,
  Gate,
  Event,
  Project,
  AgentConfig,
  GateResult,
  TaskSnapshot,
  RunSnapshot,
  TransitionRecord,
  FlockConfig,
  ConfigAgent,
  ConfigGate,
  ConfigPolicies,
} from '@onemancompany/flock-kernel';

export type {
  TaskStateInput,
  RunStateInput,
  ReviewVerdictInput,
  AgentConfigInput,
  GateResultInput,
  TaskInput,
  RunInput,
  ReviewInput,
  GateInput,
  EventInput,
  ProjectInput,
  FlockConfigInput,
} from '@onemancompany/flock-kernel';
