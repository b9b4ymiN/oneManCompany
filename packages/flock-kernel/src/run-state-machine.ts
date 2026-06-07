/**
 * Run State Machine
 *
 * Manages state transitions for Runs (agent execution instances).
 */

import { err, ok, type Result } from 'neverthrow';
import type {
  RunState,
  RunSnapshot,
  TransitionRecord,
  RunTransitionContext,
} from './types';
import { RunStateError } from './types';

/**
 * Valid state transitions for Runs.
 *
 * Flow: QUEUED → SPAWNING → RUNNING → STOPPING →
 *       SUCCEEDED / FAILED / CANCELLED
 */
const validTransitions: Record<RunState, RunState[]> = {
  QUEUED: ['SPAWNING', 'CANCELLED'],
  SPAWNING: ['RUNNING', 'FAILED', 'CANCELLED'],
  RUNNING: ['STOPPING', 'FAILED', 'CANCELLED'],
  STOPPING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

/**
 * Run State Machine
 *
 * Enforces valid state transitions for agent execution.
 */
export class RunStateMachine {
  #state: RunState;
  #history: TransitionRecord[];
  #exitCode?: number;

  constructor(initialState: RunState = 'QUEUED') {
    this.#state = initialState;
    this.#history = [];
  }

  get currentState(): RunState {
    return this.#state;
  }

  get history(): TransitionRecord[] {
    return [...this.#history];
  }

  get exitCode(): number | undefined {
    return this.#exitCode;
  }

  canTransition(to: RunState): boolean {
    return validTransitions[this.#state].includes(to);
  }

  transition(
    to: RunState,
    context: RunTransitionContext = {}
  ): Result<RunSnapshot, RunStateError> {
    if (!this.canTransition(to)) {
      return err(
        new RunStateError(
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

    // Store exit code for terminal states
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(to)) {
      this.#exitCode = context.exitCode ?? (to === 'SUCCEEDED' ? 0 : 1);
    }

    this.#history.push({
      from: previous,
      to,
      at: new Date().toISOString(),
      reason: context.reason,
    });

    return ok(this.snapshot());
  }

  snapshot(): RunSnapshot {
    return {
      current_state: this.#state,
      history: [...this.#history],
      exit_code: this.#exitCode,
    };
  }

  #validatePreconditions(
    to: RunState,
    context: RunTransitionContext
  ): Result<true, RunStateError> {
    // SPAWNING → RUNNING: Must have successfully spawned
    if (this.#state === 'SPAWNING' && to === 'RUNNING') {
      return ok(true);
    }

    // RUNNING → STOPPING: Normal progression
    if (this.#state === 'RUNNING' && to === 'STOPPING') {
      return ok(true);
    }

    // RUNNING → FAILED: Must have failure indication
    if (this.#state === 'RUNNING' && to === 'FAILED') {
      return ok(true);
    }

    // RUNNING → CANCELLED: Explicit cancellation
    if (this.#state === 'RUNNING' && to === 'CANCELLED') {
      return ok(true);
    }

    // STOPPING → SUCCEEDED: Exit code must be 0
    if (this.#state === 'STOPPING' && to === 'SUCCEEDED') {
      if (context.exitCode !== undefined && context.exitCode !== 0) {
        return err(
          new RunStateError(
            'PRECONDITION_FAILED',
            'Exit code must be 0 for successful run',
            { exitCode: context.exitCode }
          )
        );
      }
      return ok(true);
    }

    // STOPPING → FAILED: Non-zero exit code indicates failure
    if (this.#state === 'STOPPING' && to === 'FAILED') {
      if (context.exitCode === 0) {
        return err(
          new RunStateError(
            'PRECONDITION_FAILED',
            'Exit code must be non-zero for failed run',
            { exitCode: context.exitCode }
          )
        );
      }
      return ok(true);
    }

    // All other transitions are valid
    return ok(true);
  }
}
