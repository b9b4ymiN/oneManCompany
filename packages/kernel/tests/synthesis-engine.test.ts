import { describe, expect, it } from 'vitest';
import { SynthesisEngine } from '../src/synthesis-engine';

describe('SynthesisEngine', () => {
  it('maps agreement, preserves disagreement, and validates mandatory fields', () => {
    const engine = new SynthesisEngine();
    const outputs = [
      {
        agent_id: 'a1',
        summary: 'one',
        decision_state: 'CORE_CANDIDATE' as const,
        fair_value_conservative: 50,
      },
      {
        agent_id: 'a2',
        summary: 'two',
        decision_state: 'CORE_CANDIDATE' as const,
        price_to_watch: 44,
      },
      {
        agent_id: 'a3',
        summary: 'three',
        decision_state: 'CORE_CANDIDATE' as const,
      },
      { agent_id: 'a4', summary: 'four', decision_state: 'WATCH' as const },
    ];
    const agreement = engine.mapAgreement(outputs);
    expect(agreement.agreed).toBe(true);
    const assembled = engine.assemble({
      agent_outputs: outputs,
      evidence_score: 82,
      thesis_breakers: ['Demand collapse'],
      follow_up_events: ['Track filing'],
      disagreements: ['Timing differs'],
      output_requirements: {
        mandatory_fields: [
          'decision_state',
          'fair_value_conservative',
          'price_to_watch',
          'evidence_score',
          'thesis_breakers',
          'follow_up_events',
        ],
        mandatory_report_sections: [],
        forbidden_content: [],
      },
    });
    expect(assembled.decision_state).toBe('CORE_CANDIDATE');
    expect(assembled.preserved_disagreements).toEqual(['Timing differs']);
    expect(
      engine
        .validateMandatoryFields(assembled, {
          mandatory_fields: [
            'decision_state',
            'fair_value_conservative',
            'price_to_watch',
          ],
          mandatory_report_sections: [],
          forbidden_content: [],
        })
        .isOk()
    ).toBe(true);
    expect(
      engine
        .validateMandatoryFields(
          { decision_state: 'WATCH' },
          {
            mandatory_fields: ['decision_state', 'fair_value_conservative'],
            mandatory_report_sections: [],
            forbidden_content: [],
          }
        )
        .isErr()
    ).toBe(true);
  });
});
