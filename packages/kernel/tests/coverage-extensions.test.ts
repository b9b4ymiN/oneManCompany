import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConstitutionEnforcer } from '../src/constitution-enforcer';
import {
  ContextBudgetTracker,
  ContextDistributor,
  SmartCompressor,
} from '../src/context-manager';
import { DebateController } from '../src/debate-controller';
import { EvidenceController } from '../src/evidence-controller';
import { JournalWriter } from '../src/journal-writer';
import { MissionStateMachine } from '../src/state-machine';

const writers: JournalWriter[] = [];
afterEach(() => {
  while (writers.length > 0) writers.pop()?.close();
});

function swapFile(target: string): () => void {
  const backup = `${target}.bak-test`;
  fs.renameSync(target, backup);
  return () => fs.renameSync(backup, target);
}

describe('coverage extension paths', () => {
  it('covers remaining state-machine branches', () => {
    const machine = new MissionStateMachine('HUMAN_REVIEW');
    expect(machine.canTransition('ANALYZING')).toBe(true);
    expect(machine.transition('ANALYZING', { gateName: 'Gate1' }).isOk()).toBe(
      true
    );

    const crossQaGate = new MissionStateMachine('HUMAN_REVIEW');
    expect(
      crossQaGate.transition('CROSS_QA', { gateName: 'Gate2' }).isOk()
    ).toBe(true);

    const badGate = new MissionStateMachine('HUMAN_REVIEW');
    expect(badGate.transition('DECIDED', { gateName: 'Gate2' }).isErr()).toBe(
      true
    );

    const analysisPrecondition = new MissionStateMachine('ANALYZING');
    expect(
      analysisPrecondition
        .transition('CROSS_QA', { analystOutputsComplete: false })
        .isErr()
    ).toBe(true);
    const qaPrecondition = new MissionStateMachine('CROSS_QA');
    expect(
      qaPrecondition.transition('DEBATING', { crossQaComplete: false }).isErr()
    ).toBe(true);

    const debate = new MissionStateMachine('DEBATING');
    expect(
      debate.transition('SYNTHESIZING', { debateRoundsCompleted: 4 }).isErr()
    ).toBe(true);

    const decision = new MissionStateMachine('DECIDED');
    expect(
      decision.transition('FAILED', { reason: 'journal unavailable' }).isOk()
    ).toBe(true);

    const noTimeout = new MissionStateMachine('SYNTHESIZING');
    expect(
      noTimeout
        .handleTimeout({
          state: 'RESEARCHING',
          elapsedMs: 1000,
          participants: 1,
        })
        .isOk()
    ).toBe(true);
    expect(
      noTimeout
        .handleTimeout({ state: 'ANALYZING', elapsedMs: 1000, participants: 1 })
        .isOk()
    ).toBe(true);
    expect(
      noTimeout.handleTimeout({ state: 'CROSS_QA', elapsedMs: 1000 }).isOk()
    ).toBe(true);
    expect(
      noTimeout
        .handleTimeout({ state: 'DEBATING', elapsedMs: 0, roundCount: 1 })
        .isOk()
    ).toBe(true);
    expect(
      noTimeout.handleTimeout({ state: 'HUMAN_REVIEW', elapsedMs: 1000 }).isOk()
    ).toBe(true);
    expect(
      noTimeout.handleTimeout({ state: 'SYNTHESIZING', elapsedMs: 1000 }).isOk()
    ).toBe(true);
    expect(
      noTimeout.handleTimeout({ state: 'DRAFT', elapsedMs: 1000 }).isOk()
    ).toBe(true);

    const failed = new MissionStateMachine('FAILED');
    expect(
      failed.fail({ failing_state: 'FAILED', error_reason: 'again' }).isErr()
    ).toBe(true);
    expect(failed.snapshot().current_state).toBe('FAILED');
  });

  it('covers constitution enforcer clean and file-load failure paths', () => {
    const enforcer = new ConstitutionEnforcer();
    const clean = enforcer.evaluate({
      agent_id: 'pro-investor',
      pipeline_point: 'analysis',
      normalized_earnings_base: 1,
      evidence_score: 80,
      claims: [
        {
          id: 'e1',
          mission_id: 'm1',
          claim_text: 'Revenue',
          claim_label: 'FACT',
          source_name: '10-K',
          source_tier: 'tier_1',
          challenged: false,
          created_at: new Date().toISOString(),
        },
      ],
      output_text: 'Decision state only',
      assumptions: [{ name: 'growth', sensitivity: 'valuation' }],
    });
    expect(clean.isOk()).toBe(true);
    if (clean.isOk()) expect(clean.value.violations).toEqual([]);

    const constitutionPath = path.resolve(
      process.cwd(),
      'domains/investment-war-room/domain-constitution.yaml'
    );
    const restore = swapFile(constitutionPath);
    try {
      const broken = enforcer.evaluate({
        agent_id: 'pro-investor',
        pipeline_point: 'analysis',
      });
      expect(broken.isErr()).toBe(true);
    } finally {
      restore();
    }
  });

  it('covers context-manager error and branch paths', () => {
    const tracker = new ContextBudgetTracker();
    expect(() => tracker.getBudgetStatus('missing-model', 1)).toThrow(
      'Unknown model'
    );

    const modelRegistryPath = path.resolve(
      process.cwd(),
      'registry/models.yaml'
    );
    const restoreModels = swapFile(modelRegistryPath);
    try {
      expect(() => tracker.getBudgetStatus('claude-opus', 1)).toThrow();
    } finally {
      restoreModels();
    }

    const distributor = new ContextDistributor();
    const compressor = new SmartCompressor();
    const payload = {
      facts: ['f'],
      sources: [],
      key_numbers: [1],
      data_gaps: [],
      financial_statements: ['fs'],
      business_model: 'bm',
      debate_records: ['d'],
      agent_output_summaries: ['a'],
      market_context: ['m'],
      price_history: [1, 2],
      owner_portfolio_context: ['p'],
      owner_framework: ['o'],
      verbose_notes: ['v1', 'v2'],
    };
    expect(
      distributor.distribute(payload, {
        id: 'researcher-us',
        context_share: 'full_evidence_pack',
      })
    ).toEqual(payload);
    expect(
      distributor.distribute(payload, {
        id: 'damodaran-valuation',
        context_share: 'financial_plus_business_model',
      }).business_model
    ).toBe('bm');
    expect(
      distributor.distribute(payload, { id: 'other', context_share: 'unknown' })
        .business_model
    ).toBeUndefined();
    expect(
      compressor.compress({
        facts: ['f'],
        sources: [],
        key_numbers: [1],
        data_gaps: [],
      }).facts
    ).toEqual(['f']);

    const domainPath = path.resolve(
      process.cwd(),
      'domains/investment-war-room/domain.yaml'
    );
    const restoreDomain = swapFile(domainPath);
    try {
      expect(() =>
        distributor.distribute(payload, {
          id: 'researcher-us',
          context_share: 'full_evidence_pack',
        })
      ).toThrow();
    } finally {
      restoreDomain();
    }
  });

  it('covers evidence controller tag and recommendation branches', () => {
    const controller = new EvidenceController();
    expect(controller.tagClaim('FACT')).toBe('FACT');
    const noEvidencePack = controller.buildEvidencePack('m1', [], [], []);
    expect(controller.recommendAction(noEvidencePack)).toBe('abort');
    const midPack = controller.buildEvidencePack(
      'm2',
      [
        {
          id: 'e1',
          mission_id: 'm2',
          claim_text: 'Management guidance',
          claim_label: 'MANAGEMENT_CLAIM',
          source_name: 'Call',
          source_tier: 'tier_2',
          challenged: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 'e2',
          mission_id: 'm2',
          claim_text: 'Broker note',
          claim_label: 'UNVERIFIED',
          source_name: 'Broker',
          source_tier: 'tier_3',
          challenged: false,
          created_at: new Date().toISOString(),
        },
      ],
      [],
      []
    );
    expect(controller.recommendAction(midPack)).toBe('human_review');
    const grounded = controller.validateGrounding(
      { list: [1], assumption_estimate: 999 },
      midPack
    );
    expect(grounded.isOk()).toBe(true);
    const domainPath = path.resolve(
      process.cwd(),
      'domains/investment-war-room/domain.yaml'
    );
    const restoreDomain = swapFile(domainPath);
    try {
      expect(() => controller.buildEvidencePack('m3', [], [], [])).toThrow();
    } finally {
      restoreDomain();
    }
  });

  it('covers debate controller empty and additional validation branches', () => {
    const controller = new DebateController();
    expect(
      controller
        .validateChallenge({
          thread_id: 't',
          round_number: 1,
          challenger_id: 'a',
          responder_id: 'b',
          challenged_claim: 'claim',
          challenge_reason: '',
          counter_evidence: [],
        })
        .isErr()
    ).toBe(true);
    expect(
      controller
        .validateChallenge({
          thread_id: 't',
          round_number: 1,
          challenger_id: 'a',
          responder_id: 'b',
          challenged_claim: 'claim',
          challenge_reason: 'reason',
          counter_evidence: [],
        })
        .isErr()
    ).toBe(true);
    expect(controller.preserveDisagreement([])).toEqual({
      consensus: null,
      disagreements: [],
    });
  });

  it('covers journal writer error branches', () => {
    const badWriter = new JournalWriter(
      ':memory:',
      path.resolve(process.cwd(), 'docs/DOES_NOT_EXIST.sql')
    );
    const forbiddenWriter = new JournalWriter(':memory:', '/tmp/outside.sql');
    writers.push(badWriter);
    writers.push(forbiddenWriter);
    expect(badWriter.initializeSchema().isErr()).toBe(true);
    expect(forbiddenWriter.initializeSchema().isErr()).toBe(true);

    const writer = new JournalWriter();
    writers.push(writer);
    writer.initializeSchema();
    expect(writer.readJournalEntry('missing').isErr()).toBe(true);
    const lockedWriter = new JournalWriter(
      ':memory:',
      path.resolve(process.cwd(), 'docs/JOURNAL_SCHEMA.sql'),
      () => false
    );
    writers.push(lockedWriter);
    lockedWriter.initializeSchema();
    expect(lockedWriter.readJournalEntry('missing').isErr()).toBe(true);
    const bundle = {
      mission: {
        id: 'mission_dup',
        domain_id: 'investment-war-room',
        mission_type: 'stock_analysis',
        subject_type: 'equity',
        owner_brief: 'brief',
        current_state: 'DECIDED',
        status: 'complete',
        created_at: new Date().toISOString(),
      },
      agent_calls: [],
      messages: [],
      evidence_items: [],
      human_gates: [],
      debate_records: [],
      journal_entry: {
        id: 'journal_dup',
        mission_id: 'mission_dup',
        created_at: new Date().toISOString(),
        subject_json: '{}',
        decision_state: 'WATCH',
        decision_date: new Date().toISOString(),
        rationale_summary: 'ok',
      },
      agent_scorecard: [],
      cost_tracking: [],
      health_logs: [],
    };
    expect(writer.writeBundle(bundle as never).isOk()).toBe(true);
    expect(writer.writeBundle(bundle as never).isErr()).toBe(true);
    const invalidMission = { ...bundle, mission: { id: 'm_bad' } };
    expect(writer.writeBundle(invalidMission as never).isErr()).toBe(true);
  });
});
