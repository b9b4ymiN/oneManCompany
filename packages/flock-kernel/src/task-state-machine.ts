/**
 * Task State Machine
 *
 * Manages state transitions for Tasks following the pattern from
 * packages/kernel/src/state-machine.ts using neverthrow Result.
 */

import { err, ok, type Result } from 'neverthrow';
import type {
  TaskState,
  TaskSnapshot,
  TransitionRecord,
  TaskTransitionContext,
} from './types';
import { TaskStateError } from './types';

/**
 * Valid state transitions for Tasks.
 *
 * Flow: DRAFT → READY → RUNNING → AGENT_DONE → GATES_RUNNING →
 *       GATES_FAILED → REVIEW_REQUIRED → APPROVED →
 *       MERGED / REJECTED → ARCHIVED
 */
const validTransitions: Record<TaskState, TaskState[]> = {
  DRAFT: ['READY', 'ARCHIVED'],
  READY: ['RUNNING', 'ARCHIVED'],
  RUNNING: ['AGENT_DONE', 'REJECTED', 'ARCHIVED'],
  AGENT_DONE: ['GATES_RUNNING', 'REVIEW_REQUIRED', 'ARCHIVED'],
  GATES_RUNNING: ['AGENT_DONE', 'GATES_FAILED', 'REVIEW_REQUIRED'],
  GATES_FAILED: ['RUNNING', 'REJECTED', 'ARCHIVED'],
  REVIEW_REQUIRED: ['APPROVED', 'REJECTED', 'RUNNING'],
  APPROVED: ['MERGED'],
  MERGED: ['ARCHIVED'],
  REJECTED: ['RUNNING', 'ARCHIVED'],
  ARCHIVED: [],
};

/**
 * Task State Machine
 *
 * Enforces valid state transitions and validates preconditions.
 */
export class TaskStateMachine {
  #state: TaskState;
  #history: TransitionRecord[];

  constructor(initialState: TaskState = 'DRAFT') {
    this.#state = initialState;
    this.#history = [];
  }

  get currentState(): TaskState {
    return this.#state;
  }

  get history(): TransitionRecord[] {
    return [...this.#history];
  }

  canTransition(to: TaskState): boolean {
    return validTransitions[this.#state].includes(to);
  }

  transition(
    to: TaskState,
    context: TaskTransitionContext = {}
  ): Result<TaskSnapshot, TaskStateError> {
    if (!this.canTransition(to)) {
      return err(
        new TaskStateError(
          'INVALID_TRANSITION',
          `Cannot transition from ${this.#state} to ${to}`,
          { from: this.#state, to }
        )
      );
    }

    const preconditionResult = this.#validatePreconditions(to, context);
    if (preconditionResult.isErr()) {
      return err(preconditionResult.error);
    }

    const previous = this.#state;
    this.#state = to;
    this.#history.push({
      from: previous,
      to,
      at: new Date().toISOString(),
      reason: context.reason,
    });

    return ok(this.snapshot());
  }

  snapshot(): TaskSnapshot {
    return {
      current_state: this.#state,
      history: [...this.#history],
    };
  }

  #validatePreconditions(
    to: TaskState,
    context: TaskTransitionContext
  ): Result<true, TaskStateError> {
    // DRAFT → READY: Task must be properly configured
    if (this.#state === 'DRAFT' && to === 'READY') {
      // Could add validation for required fields here
      return ok(true);
    }

    // AGENT_DONE → GATES_RUNNING: Must have gate results available
    if (this.#state === 'AGENT_DONE' && to === 'GATES_RUNNING') {
      if (!context.gateResults || context.gateResults.length === 0) {
        return err(
          new TaskStateError(
            'PRECONDITION_FAILED',
            'Gate results required to start gates',
            { state: this.#state, to }
          )
        );
      }
      return ok(true);
    }

    // GATES_FAILED → RUNNING: Only allowed with human override or explicit retry
    if (this.#state === 'GATES_FAILED' && to === 'RUNNING') {
      if (!context.humanOverride) {
        return err(
          new TaskStateError(
            'PRECONDITION_FAILED',
            'Gate failure requires human override to retry',
            { state: this.#state, to }
          )
        );
      }
      return ok(true);
    }

    // REVIEW_REQUIRED → APPROVED: Must have review available
    if (this.#state === 'REVIEW_REQUIRED' && to === 'APPROVED') {
      if (!context.reviewAvailable) {
        return err(
          new TaskStateError(
            'PRECONDITION_FAILED',
            'Review required before approval',
            { state: this.#state, to }
          )
        );
      }
      return ok(true);
    }

    // REJECTED → RUNNING: Only allowed with explicit intent
    if (this.#state === 'REJECTED' && to === 'RUNNING') {
      // Allow rework after rejection
      return ok(true);
    }

    // All other transitions are valid
    return ok(true);
  }
}
