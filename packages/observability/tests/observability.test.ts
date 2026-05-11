import { describe, expect, it } from 'vitest';
import { OutputValidator } from '../src/output-validator';
import { MissionTracer } from '../src/mission-tracer';
import { ReplayEngine } from '../src/replay-engine';
import { StructuredLogger } from '../src/structured-logger';

describe('observability package', () => {
  it('validates outputs, records traces, and exposes a replay stub', () => {
    const validator = new OutputValidator();
    const valid = validator.validate('researcher-us', {
      agent_id: 'researcher-us',
      mission_id: 'm1',
      summary: 'ok',
      evidence_score: 80,
      evidence_used: [],
      data_gaps: [],
      assumptions: [],
      open_questions: [],
      thesis_breakers: [],
      market: 'us-nasdaq',
      source_log: [
        {
          claim: 'Revenue 400000000',
          source_name: '10-K',
          source_tier: 'tier_1',
          label: 'FACT',
        },
      ],
      filings_collected: ['sec_10k'],
      evidence_pack_status: 'complete',
      recommended_next_step: 'proceed',
    });
    expect(valid.isOk()).toBe(true);
    expect(validator.validate('researcher-us', { broken: true }).isErr()).toBe(
      true
    );

    const tracer = new MissionTracer();
    tracer.record('DRAFT', 'PLANNING', '2026-05-12T00:00:00.000Z');
    expect(tracer.events).toHaveLength(1);

    const replay = new ReplayEngine();
    expect(replay.replay('m1').status).toBe('stub');
  });

  it('creates a structured logger with mission_id metadata', () => {
    const logger = new StructuredLogger().create('m1');
    expect(logger.defaultMeta).toMatchObject({ mission_id: 'm1' });
  });
});
