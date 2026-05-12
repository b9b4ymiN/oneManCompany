import { describe, expect, it } from 'vitest';
import { EvidenceController } from '@onemancompany/kernel';

describe('grounding checks', () => {
  it('rejects sourceless FACT-style numeric outputs', () => {
    const controller = new EvidenceController();
    const pack = controller.buildEvidencePack(
      'm1',
      [
        {
          id: 'e1',
          mission_id: 'm1',
          agent_id: 'researcher-set',
          claim_text: 'Revenue 400',
          claim_label: 'FACT',
          source_name: 'SET filing',
          source_tier: 'tier_1',
          challenged: false,
          created_at: new Date().toISOString(),
          numeric_value: 400,
        },
      ],
      ['annual_report_56_1'],
      []
    );
    const grounded = controller.validateGrounding(
      { fair_value_conservative: 999 },
      pack
    );
    if (grounded.isOk()) {
      expect(grounded.value.valid).toBe(false);
    }
  });
});
