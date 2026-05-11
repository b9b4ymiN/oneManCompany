import { afterEach, describe, expect, it } from 'vitest';
import { JournalWriter } from '../src/journal-writer';

const writers: JournalWriter[] = [];

afterEach(() => {
  while (writers.length > 0) {
    writers.pop()?.close();
  }
});

describe('JournalWriter', () => {
  it('initializes schema, writes bundle, and validates read-back', () => {
    const writer = new JournalWriter();
    writers.push(writer);
    expect(writer.initializeSchema().isOk()).toBe(true);
    expect(writer.canReadMission('mission_1')).toBe(true);
    const bundle = {
      mission: {
        id: 'mission_1',
        domain_id: 'investment-war-room',
        mission_type: 'stock_analysis',
        subject_type: 'equity',
        ticker: 'MOCK_STOCK',
        market: 'us-nasdaq',
        owner_brief: 'analyze MOCK_STOCK with earnings 400M',
        current_state: 'DECIDED' as const,
        final_state: 'JOURNALED' as const,
        status: 'complete',
        evidence_score: 82,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        metadata_json: JSON.stringify({ source: 'test' }),
      },
      agent_calls: [
        {
          id: 'call_1',
          mission_id: 'mission_1',
          agent_id: 'researcher-us',
          mission_state: 'RESEARCHING',
          provider: 'mock',
          model_id: 'gemini-2-flash',
          timestamp_start: new Date().toISOString(),
        },
      ],
      messages: [
        {
          id: 'msg_1',
          mission_id: 'mission_1',
          thread_id: 'thread_1',
          message_type: 'analysis_report',
          sender_id: 'cio-synthesizer',
          content_json: JSON.stringify({ hello: 'world' }),
          created_at: new Date().toISOString(),
        },
      ],
      evidence_items: [
        {
          id: 'evidence_1',
          mission_id: 'mission_1',
          claim_text: 'Revenue 400000000',
          claim_label: 'FACT',
          source_name: '10-K',
          source_tier: 'tier_1',
          challenged: 0,
          created_at: new Date().toISOString(),
        },
      ],
      human_gates: [
        {
          id: 'gate_1',
          mission_id: 'mission_1',
          gate_name: 'Gate3',
          triggered_after_state: 'SYNTHESIZING',
          gate_type: 'MANDATORY',
          reason_text: 'Final approval',
          created_at: new Date().toISOString(),
        },
      ],
      debate_records: [
        {
          id: 'debate_1',
          mission_id: 'mission_1',
          thread_id: 'thread_1',
          round_number: 1,
          challenger_id: 'damodaran-valuation',
          responder_id: 'klarman-downside',
          challenged_claim: 'Growth',
          challenge_reason: 'Counter evidence',
          status: 'PARTIAL',
          created_at: new Date().toISOString(),
        },
      ],
      journal_entry: {
        id: 'journal_1',
        mission_id: 'mission_1',
        created_at: new Date().toISOString(),
        subject_json: JSON.stringify({ ticker: 'MOCK_STOCK' }),
        decision_state: 'CORE_CANDIDATE',
        decision_date: new Date().toISOString(),
        rationale_summary: 'Attractive setup',
        valuation_json: JSON.stringify({ fair_value: 50 }),
        assumptions_json: JSON.stringify([{ name: 'growth', value: 0.08 }]),
        evidence_json: JSON.stringify([{ source: '10-K' }]),
        analyst_views_json: JSON.stringify(['valuation positive']),
        thesis_breakers_json: JSON.stringify(['demand collapse']),
        follow_up_events_json: JSON.stringify(['track next filing']),
      },
      agent_scorecard: [
        {
          id: 'score_1',
          agent_id: 'researcher-us',
          period_start: new Date().toISOString(),
          period_end: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
      cost_tracking: [
        {
          id: 'cost_1',
          mission_id: 'mission_1',
          agent_id: 'researcher-us',
          recorded_at: new Date().toISOString(),
        },
      ],
      health_logs: [
        {
          id: 'health_1',
          mission_id: 'mission_1',
          component_name: 'mock.adapter',
          component_type: 'adapter',
          status: 'healthy',
          recorded_at: new Date().toISOString(),
        },
      ],
    };

    const writeResult = writer.writeBundle(bundle);
    expect(writeResult.isOk()).toBe(true);
    const readResult = writer.readJournalEntry('mission_1');
    expect(readResult.isOk()).toBe(true);
    if (readResult.isOk()) {
      expect(readResult.value.mission_id).toBe('mission_1');
      expect(readResult.value.decision_state).toBe('CORE_CANDIDATE');
    }
  });

  it('returns structured schema errors for invalid payloads', () => {
    const writer = new JournalWriter();
    writers.push(writer);
    writer.initializeSchema();
    const result = writer.writeBundle({
      mission: {
        id: 'mission_2',
        domain_id: 'investment-war-room',
        mission_type: 'stock_analysis',
        subject_type: 'equity',
        owner_brief: 'brief',
        current_state: 'DECIDED' as const,
        status: 'complete',
        created_at: new Date().toISOString(),
      },
      agent_calls: [],
      messages: [],
      evidence_items: [],
      human_gates: [],
      debate_records: [],
      journal_entry: {
        id: 'journal_2',
        mission_id: 'mission_2',
        created_at: new Date().toISOString(),
        decision_state: 'WATCH',
      },
      agent_scorecard: [],
      cost_tracking: [],
      health_logs: [],
    } as never);
    expect(result.isErr()).toBe(true);
  });
});
