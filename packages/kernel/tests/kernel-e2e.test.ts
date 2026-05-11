import { afterEach, describe, expect, it } from 'vitest';
import { MockAdapter } from '@onemancompany/adapters';
import { MissionTracer, OutputValidator } from '@onemancompany/observability';
import { ConstitutionEnforcer } from '../src/constitution-enforcer';
import { DebateController } from '../src/debate-controller';
import { EvidenceController } from '../src/evidence-controller';
import { HumanGate } from '../src/human-gate';
import { JournalWriter } from '../src/journal-writer';
import { MissionPlanner } from '../src/mission-planner';
import { MissionStateMachine } from '../src/state-machine';
import { SynthesisEngine } from '../src/synthesis-engine';
import { TeamBuilder } from '../src/team-builder';

const writers: JournalWriter[] = [];

afterEach(() => {
  while (writers.length > 0) {
    writers.pop()?.close();
  }
});

describe('kernel end-to-end lifecycle', () => {
  it('runs DRAFT -> JOURNALED with mock adapters and logs all transitions', () => {
    const planner = new MissionPlanner();
    const plan = planner.planMission('analyze MOCK_STOCK with earnings 400M');
    expect(plan.isOk()).toBe(true);
    if (plan.isErr()) return;

    const builder = new TeamBuilder();
    const executionPlan = builder.buildExecutionPlan(plan.value, {
      'gemini-2-flash': true,
      'claude-opus': true,
      'claude-sonnet': true,
      'zai-default': true,
    });
    expect(executionPlan.isOk()).toBe(true);
    if (executionPlan.isErr()) return;

    const stateMachine = new MissionStateMachine();
    const tracer = new MissionTracer();
    const adapter = new MockAdapter();
    const validator = new OutputValidator();
    const evidenceController = new EvidenceController();
    const debateController = new DebateController();
    const synthesisEngine = new SynthesisEngine();
    const constitution = new ConstitutionEnforcer();
    const humanGate = new HumanGate();
    const writer = new JournalWriter();
    writers.push(writer);
    writer.initializeSchema();

    const step = (
      to: Parameters<MissionStateMachine['transition']>[0],
      context: Parameters<MissionStateMachine['transition']>[1]
    ) => {
      const from = stateMachine.currentState;
      const result = stateMachine.transition(to, context);
      expect(result.isOk()).toBe(true);
      tracer.record(
        from,
        to,
        result.isOk() ? result.value.history.at(-1)?.at : undefined
      );
    };

    step('PLANNING', { brief: plan.value.owner_brief });
    step('RESEARCHING', { teamReady: true, evidenceRequirementsReady: true });

    const researcherResult = adapter.execute({
      mission_id: plan.value.mission_id,
      agent_id: 'researcher-us',
    });
    expect(researcherResult.isOk()).toBe(true);
    if (researcherResult.isErr() || researcherResult.value.status !== 'success')
      return;
    expect(
      validator.validate('researcher-us', researcherResult.value.output).isOk()
    ).toBe(true);

    const evidencePack = evidenceController.buildEvidencePack(
      plan.value.mission_id,
      [
        {
          id: 'e1',
          mission_id: plan.value.mission_id,
          claim_text: 'Revenue 400000000',
          claim_label: 'FACT',
          source_name: '10-K',
          source_tier: 'tier_1',
          challenged: false,
          created_at: new Date().toISOString(),
          numeric_value: 400000000,
        },
        {
          id: 'e2',
          mission_id: plan.value.mission_id,
          claim_text: 'Margin 20',
          claim_label: 'FACT',
          source_name: '10-Q',
          source_tier: 'tier_1',
          challenged: false,
          created_at: new Date().toISOString(),
          numeric_value: 20,
        },
        {
          id: 'e3',
          mission_id: plan.value.mission_id,
          claim_text: 'Guidance intact',
          claim_label: 'MANAGEMENT_CLAIM',
          source_name: 'Call',
          source_tier: 'tier_2',
          challenged: false,
          created_at: new Date().toISOString(),
        },
      ],
      ['sec_10k'],
      []
    );
    expect(
      constitution
        .evaluate({
          agent_id: 'researcher-us',
          pipeline_point: 'research',
          evidence_score: evidencePack.score,
        })
        .isOk()
    ).toBe(true);

    step('ANALYZING', { evidenceScore: evidencePack.score });

    const analystIds = [
      'forensic-accountant',
      'damodaran-valuation',
      'klarman-downside',
      'pro-investor',
    ] as const;
    const outputs: Array<
      Record<string, unknown> & {
        agent_id: string;
        decision_state?: 'CORE_CANDIDATE' | 'WATCH';
      }
    > = [];
    for (const agentId of analystIds) {
      const result = adapter.execute({
        mission_id: plan.value.mission_id,
        agent_id: agentId,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk() && result.value.status === 'success') {
        outputs.push(
          result.value.output as Record<string, unknown> & {
            agent_id: string;
            decision_state?: 'CORE_CANDIDATE' | 'WATCH';
          }
        );
      }
    }

    step('CROSS_QA', { analystOutputsComplete: true });
    step('DEBATING', { crossQaComplete: true });
    const debate = debateController.validateChallenge({
      thread_id: 'thread-1',
      round_number: 1,
      challenger_id: 'damodaran-valuation',
      responder_id: 'klarman-downside',
      challenged_claim: 'Growth assumption',
      challenge_reason: 'Counter evidence from filings',
      counter_evidence: [
        {
          claim: 'Growth slowed',
          source_name: '10-K',
          source_tier: 'tier_1',
          label: 'FACT',
        },
      ],
    });
    expect(debate.isOk()).toBe(true);
    step('SYNTHESIZING', { debateRoundsCompleted: 3 });

    const cioResult = adapter.execute({
      mission_id: plan.value.mission_id,
      agent_id: 'cio-synthesizer',
    });
    expect(cioResult.isOk()).toBe(true);
    if (cioResult.isErr() || cioResult.value.status !== 'success') return;
    outputs.push(
      cioResult.value.output as Record<string, unknown> & {
        agent_id: string;
        decision_state?: 'CORE_CANDIDATE' | 'WATCH';
      }
    );
    const synthesis = synthesisEngine.assemble({
      agent_outputs: outputs,
      evidence_score: evidencePack.score,
      thesis_breakers: ['Demand collapse'],
      follow_up_events: ['Track next filing'],
      disagreements: ['Timing differs'],
      output_requirements: plan.value.output_requirements,
    });
    expect(
      synthesisEngine
        .validateMandatoryFields(synthesis, plan.value.output_requirements)
        .isOk()
    ).toBe(true);

    step('HUMAN_REVIEW', { mandatoryFieldsPresent: true });
    const gate = humanGate.resolve(
      {
        mission_id: plan.value.mission_id,
        gate_name: 'Gate3',
        gate_type: 'MANDATORY',
        triggered_after_state: 'SYNTHESIZING',
        reason_text: 'Owner approval',
        evidence_summary: 'Evidence strong',
        data_gaps: [],
        available_actions: ['confirm'],
        wait_seconds: 60,
      },
      () => 'confirm'
    );
    expect(gate.isOk()).toBe(true);
    step('DECIDED', { gateName: 'Gate3' });

    const writeResult = writer.writeBundle({
      mission: {
        id: plan.value.mission_id,
        domain_id: plan.value.domain,
        mission_type: plan.value.mission_type,
        subject_type: 'equity',
        ticker: plan.value.subject.ticker,
        market: plan.value.subject.market,
        owner_brief: plan.value.owner_brief,
        current_state: 'DECIDED',
        final_state: 'JOURNALED',
        status: 'complete',
        evidence_score: evidencePack.score,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        metadata_json: JSON.stringify(plan.value.metadata),
      },
      agent_calls: [],
      messages: [],
      evidence_items: [],
      human_gates: [],
      debate_records: [],
      journal_entry: {
        id: 'journal-e2e',
        mission_id: plan.value.mission_id,
        created_at: new Date().toISOString(),
        subject_json: JSON.stringify(plan.value.subject),
        decision_state: synthesis.decision_state,
        decision_date: new Date().toISOString(),
        rationale_summary: 'Consensus with preserved disagreement',
        valuation_json: JSON.stringify({
          fair_value_conservative: synthesis.fair_value_conservative,
        }),
        assumptions_json: JSON.stringify([]),
        evidence_json: JSON.stringify([]),
        analyst_views_json: JSON.stringify(synthesis.analyst_views),
        thesis_breakers_json: JSON.stringify(synthesis.thesis_breakers),
        follow_up_events_json: JSON.stringify(synthesis.follow_up_events),
      },
      agent_scorecard: [],
      cost_tracking: [],
      health_logs: [],
    });
    expect(writeResult.isOk()).toBe(true);
    step('JOURNALED', { journalValidated: true });

    expect(stateMachine.currentState).toBe('JOURNALED');
    expect(tracer.events.map((event) => `${event.from}->${event.to}`)).toEqual([
      'DRAFT->PLANNING',
      'PLANNING->RESEARCHING',
      'RESEARCHING->ANALYZING',
      'ANALYZING->CROSS_QA',
      'CROSS_QA->DEBATING',
      'DEBATING->SYNTHESIZING',
      'SYNTHESIZING->HUMAN_REVIEW',
      'HUMAN_REVIEW->DECIDED',
      'DECIDED->JOURNALED',
    ]);
    expect(
      tracer.events.every((event) => typeof event.timestamp === 'string')
    ).toBe(true);
  });

  it('transitions to FAILED with partial output preserved when adapter fails', () => {
    const planner = new MissionPlanner();
    const plan = planner.planMission('analyze MOCK_STOCK with earnings 400M');
    expect(plan.isOk()).toBe(true);
    if (plan.isErr()) return;
    const adapter = new MockAdapter();
    const machine = new MissionStateMachine('ANALYZING');
    const timeout = adapter.execute({
      mission_id: plan.value.mission_id,
      agent_id: 'cio-synthesizer',
      mode: 'timeout',
    });
    expect(timeout.isOk()).toBe(true);
    if (timeout.isOk() && timeout.value.status !== 'success') {
      const failed = machine.fail({
        failing_state: 'ANALYZING',
        error_reason: timeout.value.error_reason,
        partial_output: timeout.value.partial_output,
      });
      expect(failed.isOk()).toBe(true);
      expect(machine.currentState).toBe('FAILED');
      expect(machine.failure?.partial_output).not.toBeNull();
    }
  });
});
