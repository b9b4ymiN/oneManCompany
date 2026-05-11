import { err, ok, type Result } from 'neverthrow';
import type {
  MissionFailure,
  MissionPlanContext,
  MissionState,
  TimeoutCheckInput,
  TimeoutOutcome,
  TimeoutPolicy,
  TransitionRecord,
} from './types';

export type MissionStateErrorCode =
  | 'INVALID_TRANSITION'
  | 'PRECONDITION_FAILED'
  | 'TIMEOUT'
  | 'MISSION_FAILED';

export class MissionStateError extends Error {
  constructor(
    readonly code: MissionStateErrorCode,
    message: string,
    readonly details: unknown = {}
  ) {
    super(message);
  }
}

export interface MissionSnapshot {
  current_state: MissionState;
  history: TransitionRecord[];
  failure?: MissionFailure;
}

const validTransitions: Record<MissionState, MissionState[]> = {
  DRAFT: ['PLANNING', 'FAILED'],
  PLANNING: ['RESEARCHING', 'FAILED'],
  RESEARCHING: ['ANALYZING', 'HUMAN_REVIEW', 'FAILED'],
  HUMAN_REVIEW: ['ANALYZING', 'CROSS_QA', 'DECIDED', 'FAILED'],
  ANALYZING: ['CROSS_QA', 'HUMAN_REVIEW', 'FAILED'],
  CROSS_QA: ['DEBATING', 'FAILED'],
  DEBATING: ['SYNTHESIZING', 'FAILED'],
  SYNTHESIZING: ['HUMAN_REVIEW', 'FAILED'],
  DECIDED: ['JOURNALED', 'FAILED'],
  JOURNALED: [],
  FAILED: [],
};

export const defaultTimeoutPolicy: TimeoutPolicy = {
  researchingPerResearcherMs: 180_000,
  analyzingPerAnalystMs: 120_000,
  crossQaMs: 90_000,
  synthesizingMs: 120_000,
  autoProceedGateMs: 60_000,
  maxDebateRounds: 3,
};

export class MissionStateMachine {
  #state: MissionState;
  #history: TransitionRecord[];
  #failure?: MissionFailure;
  readonly timeoutPolicy: TimeoutPolicy;

  constructor(
    initialState: MissionState = 'DRAFT',
    timeoutPolicy: Partial<TimeoutPolicy> = {}
  ) {
    this.#state = initialState;
    this.#history = [];
    this.timeoutPolicy = { ...defaultTimeoutPolicy, ...timeoutPolicy };
  }

  get currentState(): MissionState {
    return this.#state;
  }

  get history(): TransitionRecord[] {
    return [...this.#history];
  }

  get failure(): MissionFailure | undefined {
    return this.#failure;
  }

  canTransition(to: MissionState): boolean {
    return validTransitions[this.#state].includes(to);
  }

  transition(
    to: MissionState,
    context: MissionPlanContext = {}
  ): Result<MissionSnapshot, MissionStateError> {
    if (!this.canTransition(to)) {
      return err(
        new MissionStateError(
          'INVALID_TRANSITION',
          `Cannot transition from ${this.#state} to ${to}`,
          {
            from: this.#state,
            to,
          }
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

  fail(failure: MissionFailure): Result<MissionSnapshot, MissionStateError> {
    if (this.#state === 'FAILED') {
      return err(
        new MissionStateError(
          'MISSION_FAILED',
          'Mission already failed',
          failure
        )
      );
    }
    this.#failure = failure;
    const previous = this.#state;
    this.#state = 'FAILED';
    this.#history.push({
      from: previous,
      to: 'FAILED',
      at: new Date().toISOString(),
      reason: failure.error_reason,
    });
    return ok(this.snapshot());
  }

  handleTimeout(
    input: TimeoutCheckInput
  ): Result<TimeoutOutcome, MissionStateError> {
    const participants = input.participants ?? 1;
    switch (input.state) {
      case 'RESEARCHING':
        return ok({
          timedOut:
            input.elapsedMs >
            this.timeoutPolicy.researchingPerResearcherMs * participants,
          action:
            input.elapsedMs >
            this.timeoutPolicy.researchingPerResearcherMs * participants
              ? 'flag_partial_proceed'
              : 'none',
          nextState:
            input.elapsedMs >
            this.timeoutPolicy.researchingPerResearcherMs * participants
              ? 'ANALYZING'
              : undefined,
          reason: '3 min per researcher',
        });
      case 'ANALYZING':
        return ok({
          timedOut:
            input.elapsedMs >
            this.timeoutPolicy.analyzingPerAnalystMs * participants,
          action:
            input.elapsedMs >
            this.timeoutPolicy.analyzingPerAnalystMs * participants
              ? 'skip_failed_agent'
              : 'none',
          nextState:
            input.elapsedMs >
            this.timeoutPolicy.analyzingPerAnalystMs * participants
              ? 'CROSS_QA'
              : undefined,
          reason: '2 min per analyst',
        });
      case 'CROSS_QA':
        return ok({
          timedOut: input.elapsedMs > this.timeoutPolicy.crossQaMs,
          action:
            input.elapsedMs > this.timeoutPolicy.crossQaMs ? 'proceed' : 'none',
          nextState:
            input.elapsedMs > this.timeoutPolicy.crossQaMs
              ? 'DEBATING'
              : undefined,
          reason: '90 sec cross-QA budget',
        });
      case 'DEBATING':
        return ok({
          timedOut:
            (input.roundCount ?? 0) >= this.timeoutPolicy.maxDebateRounds,
          action:
            (input.roundCount ?? 0) >= this.timeoutPolicy.maxDebateRounds
              ? 'close_unresolved'
              : 'none',
          nextState:
            (input.roundCount ?? 0) >= this.timeoutPolicy.maxDebateRounds
              ? 'SYNTHESIZING'
              : undefined,
          reason: 'max 3 rounds',
        });
      case 'SYNTHESIZING':
        if (input.elapsedMs > this.timeoutPolicy.synthesizingMs) {
          return ok({
            timedOut: true,
            action: 'fail',
            nextState: 'FAILED',
            reason: '2 min synthesis budget',
          });
        }
        return ok({ timedOut: false, action: 'none' });
      case 'HUMAN_REVIEW':
        return ok({
          timedOut: input.elapsedMs > this.timeoutPolicy.autoProceedGateMs,
          action:
            input.elapsedMs > this.timeoutPolicy.autoProceedGateMs
              ? 'auto_proceed'
              : 'none',
          reason: '60 sec auto proceed gate',
        });
      default:
        return ok({ timedOut: false, action: 'none' });
    }
  }

  snapshot(): MissionSnapshot {
    return {
      current_state: this.#state,
      history: [...this.#history],
      failure: this.#failure,
    };
  }

  #validatePreconditions(
    to: MissionState,
    context: MissionPlanContext
  ): Result<true, MissionStateError> {
    if (
      this.#state === 'DRAFT' &&
      to === 'PLANNING' &&
      !context.brief?.trim()
    ) {
      return err(
        new MissionStateError('PRECONDITION_FAILED', 'Owner brief is required')
      );
    }
    if (
      this.#state === 'PLANNING' &&
      to === 'RESEARCHING' &&
      (!context.teamReady || !context.evidenceRequirementsReady)
    ) {
      return err(
        new MissionStateError(
          'PRECONDITION_FAILED',
          'Team and evidence requirements must exist'
        )
      );
    }
    if (
      this.#state === 'RESEARCHING' &&
      to === 'ANALYZING' &&
      (context.evidenceScore === undefined || context.evidenceScore < 40) &&
      !context.humanOverride
    ) {
      return err(
        new MissionStateError(
          'PRECONDITION_FAILED',
          'Evidence score below 40 requires human review or override'
        )
      );
    }
    if (
      this.#state === 'ANALYZING' &&
      to === 'CROSS_QA' &&
      !context.analystOutputsComplete
    ) {
      return err(
        new MissionStateError(
          'PRECONDITION_FAILED',
          'All analyst outputs must be available'
        )
      );
    }
    if (
      this.#state === 'CROSS_QA' &&
      to === 'DEBATING' &&
      !context.crossQaComplete
    ) {
      return err(
        new MissionStateError(
          'PRECONDITION_FAILED',
          'Cross-QA must be complete'
        )
      );
    }
    if (
      this.#state === 'DEBATING' &&
      to === 'SYNTHESIZING' &&
      (context.debateRoundsCompleted ?? 0) > this.timeoutPolicy.maxDebateRounds
    ) {
      return err(
        new MissionStateError(
          'PRECONDITION_FAILED',
          'Debate exceeded maximum rounds'
        )
      );
    }
    if (
      this.#state === 'SYNTHESIZING' &&
      to === 'HUMAN_REVIEW' &&
      !context.mandatoryFieldsPresent
    ) {
      return err(
        new MissionStateError(
          'PRECONDITION_FAILED',
          'Mandatory synthesis fields must be present before review'
        )
      );
    }
    if (
      this.#state === 'HUMAN_REVIEW' &&
      to === 'DECIDED' &&
      context.gateName !== 'Gate3'
    ) {
      return err(
        new MissionStateError(
          'PRECONDITION_FAILED',
          'Only Gate3 review can transition to DECIDED'
        )
      );
    }
    if (
      this.#state === 'DECIDED' &&
      to === 'JOURNALED' &&
      !context.journalValidated
    ) {
      return err(
        new MissionStateError(
          'PRECONDITION_FAILED',
          'Journal schema must validate before write'
        )
      );
    }
    return ok(true);
  }
}
