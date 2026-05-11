import { describe, expect, it } from 'vitest';
import { MissionStateMachine } from '../src/state-machine';

function planContext() {
  return {
    brief: 'analyze MOCK_STOCK with earnings 400M',
    teamReady: true,
    evidenceRequirementsReady: true,
    evidenceScore: 82,
    humanOverride: true,
    analystOutputsComplete: true,
    crossQaComplete: true,
    debateRoundsCompleted: 3,
    mandatoryFieldsPresent: true,
    gateName: 'Gate3',
    journalValidated: true,
  };
}

describe('MissionStateMachine', () => {
  it('runs the full happy-path lifecycle including all valid transitions', () => {
    const machine = new MissionStateMachine();
    const ctx = planContext();
    expect(machine.transition('PLANNING', { brief: ctx.brief }).isOk()).toBe(
      true
    );
    expect(
      machine
        .transition('RESEARCHING', {
          teamReady: true,
          evidenceRequirementsReady: true,
        })
        .isOk()
    ).toBe(true);
    expect(machine.transition('ANALYZING', { evidenceScore: 82 }).isOk()).toBe(
      true
    );
    expect(
      machine
        .transition('HUMAN_REVIEW', {
          reason: 'optional analysis checkpoint',
        })
        .isOk()
    ).toBe(true);
    expect(
      machine
        .transition('CROSS_QA', {
          gateName: 'Gate2',
        })
        .isOk()
    ).toBe(true);
    expect(
      machine.transition('DEBATING', { crossQaComplete: true }).isOk()
    ).toBe(true);
    expect(
      machine.transition('SYNTHESIZING', { debateRoundsCompleted: 3 }).isOk()
    ).toBe(true);
    expect(
      machine
        .transition('HUMAN_REVIEW', {
          mandatoryFieldsPresent: true,
        })
        .isOk()
    ).toBe(true);
    expect(machine.transition('DECIDED', { gateName: 'Gate3' }).isOk()).toBe(
      true
    );
    const journalResult = machine.transition('JOURNALED', {
      journalValidated: true,
    });
    expect(journalResult.isOk()).toBe(true);
    expect(machine.currentState).toBe('JOURNALED');
    expect(machine.history).toHaveLength(10);
  });

  it('supports the direct analyzing path without optional analysis gate', () => {
    const machine = new MissionStateMachine();
    expect(
      machine
        .transition('PLANNING', {
          brief: 'analyze MOCK_STOCK with earnings 400M',
        })
        .isOk()
    ).toBe(true);
    expect(
      machine
        .transition('RESEARCHING', {
          teamReady: true,
          evidenceRequirementsReady: true,
        })
        .isOk()
    ).toBe(true);
    expect(machine.transition('ANALYZING', { evidenceScore: 75 }).isOk()).toBe(
      true
    );
    expect(
      machine.transition('CROSS_QA', { analystOutputsComplete: true }).isOk()
    ).toBe(true);
  });

  it('returns Err for invalid transitions and guards without throwing', () => {
    const machine = new MissionStateMachine();
    const invalidTransition = machine.transition('RESEARCHING');
    expect(invalidTransition.isErr()).toBe(true);
    if (invalidTransition.isErr()) {
      expect(invalidTransition.error.code).toBe('INVALID_TRANSITION');
    }

    const missingBrief = machine.transition('PLANNING');
    expect(missingBrief.isErr()).toBe(true);

    const planningMachine = new MissionStateMachine();
    planningMachine.transition('PLANNING', {
      brief: 'analyze MOCK_STOCK with earnings 400M',
    });
    expect(
      planningMachine
        .transition('RESEARCHING', {
          teamReady: false,
          evidenceRequirementsReady: true,
        })
        .isErr()
    ).toBe(true);

    const researchMachine = new MissionStateMachine();
    researchMachine.transition('PLANNING', {
      brief: 'analyze MOCK_STOCK with earnings 400M',
    });
    researchMachine.transition('RESEARCHING', {
      teamReady: true,
      evidenceRequirementsReady: true,
    });
    expect(
      researchMachine.transition('ANALYZING', { evidenceScore: 10 }).isErr()
    ).toBe(true);

    const synthMachine = new MissionStateMachine('SYNTHESIZING');
    expect(
      synthMachine
        .transition('HUMAN_REVIEW', { mandatoryFieldsPresent: false })
        .isErr()
    ).toBe(true);

    const decisionMachine = new MissionStateMachine('DECIDED');
    expect(
      decisionMachine
        .transition('JOURNALED', { journalValidated: false })
        .isErr()
    ).toBe(true);
  });

  it('handles configured timeout outcomes and failed synthesis preservation', () => {
    const machine = new MissionStateMachine('RESEARCHING');
    const researchTimeout = machine.handleTimeout({
      state: 'RESEARCHING',
      elapsedMs: 181000,
      participants: 1,
    });
    expect(researchTimeout.isOk()).toBe(true);
    if (researchTimeout.isOk()) {
      expect(researchTimeout.value.action).toBe('flag_partial_proceed');
    }
    const analysisTimeout = machine.handleTimeout({
      state: 'ANALYZING',
      elapsedMs: 121000,
      participants: 1,
    });
    expect(analysisTimeout.isOk()).toBe(true);
    if (analysisTimeout.isOk()) {
      expect(analysisTimeout.value.action).toBe('skip_failed_agent');
    }
    const qaTimeout = machine.handleTimeout({
      state: 'CROSS_QA',
      elapsedMs: 91000,
    });
    expect(qaTimeout.isOk()).toBe(true);
    if (qaTimeout.isOk()) {
      expect(qaTimeout.value.action).toBe('proceed');
    }
    const debateTimeout = machine.handleTimeout({
      state: 'DEBATING',
      elapsedMs: 0,
      roundCount: 3,
    });
    expect(debateTimeout.isOk()).toBe(true);
    if (debateTimeout.isOk()) {
      expect(debateTimeout.value.action).toBe('close_unresolved');
    }
    const reviewTimeout = machine.handleTimeout({
      state: 'HUMAN_REVIEW',
      elapsedMs: 61000,
    });
    expect(reviewTimeout.isOk()).toBe(true);
    if (reviewTimeout.isOk()) {
      expect(reviewTimeout.value.action).toBe('auto_proceed');
    }

    const synthMachine = new MissionStateMachine('SYNTHESIZING');
    const synthTimeout = synthMachine.handleTimeout({
      state: 'SYNTHESIZING',
      elapsedMs: 121000,
    });
    expect(synthTimeout.isOk()).toBe(true);
    if (synthTimeout.isOk()) {
      expect(synthTimeout.value.nextState).toBe('FAILED');
    }
    expect(synthMachine.currentState).toBe('SYNTHESIZING');
    const failResult = synthMachine.fail({
      failing_state: 'SYNTHESIZING',
      error_reason: 'Synthesis timeout',
      partial_output: null,
    });
    expect(failResult.isOk()).toBe(true);
    expect(synthMachine.currentState).toBe('FAILED');
  });

  it('preserves partial output on explicit failure', () => {
    const machine = new MissionStateMachine('ANALYZING');
    const result = machine.fail({
      failing_state: 'ANALYZING',
      error_reason: 'adapter error',
      partial_output: { agent_id: 'damodaran-valuation', summary: 'partial' },
    });
    expect(result.isOk()).toBe(true);
    expect(machine.failure?.partial_output).toEqual({
      agent_id: 'damodaran-valuation',
      summary: 'partial',
    });
  });
});
