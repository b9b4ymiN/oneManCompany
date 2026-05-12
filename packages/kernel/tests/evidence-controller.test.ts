import { describe, expect, it } from 'vitest';
import { EvidenceController } from '../src/evidence-controller';

describe('EvidenceController', () => {
  const controller = new EvidenceController();
  const items = [
    {
      id: 'e1',
      mission_id: 'm1',
      claim_text: 'Revenue 400000000',
      claim_label: 'FACT' as const,
      source_name: '10-K',
      source_tier: 'tier_1' as const,
      challenged: false,
      created_at: new Date().toISOString(),
      numeric_value: 400000000,
    },
    {
      id: 'e2',
      mission_id: 'm1',
      claim_text: 'Margin 20%',
      claim_label: 'FACT' as const,
      source_name: '10-Q',
      source_tier: 'tier_1' as const,
      challenged: false,
      created_at: new Date().toISOString(),
      numeric_value: 20,
    },
    {
      id: 'e3',
      mission_id: 'm1',
      claim_text: 'Guidance intact',
      claim_label: 'MANAGEMENT_CLAIM' as const,
      source_name: 'Call',
      source_tier: 'tier_2' as const,
      challenged: false,
      created_at: new Date().toISOString(),
    },
  ];

  it('calculates evidence score and action thresholds', () => {
    const pack = controller.buildEvidencePack('m1', items, ['sec_10k'], []);
    expect(pack.score).toBe(80);
    expect(controller.recommendAction(pack)).toBe('proceed');
  });

  it('tracks critical data gaps and tier5-only penalties', () => {
    const gaps = controller.trackDataGaps(
      ['normalized_earnings', 'capex'],
      ['normalized_earnings']
    );
    expect(gaps).toHaveLength(1);
    const tier5Score = controller.calculateEvidenceScore(
      [
        {
          id: 'e4',
          mission_id: 'm1',
          claim_text: 'rumor',
          claim_label: 'UNVERIFIED' as const,
          source_tier: 'tier_5' as const,
          challenged: false,
          created_at: new Date().toISOString(),
        },
      ],
      [],
      gaps
    );
    expect(tier5Score).toBe(0);
  });

  it('handles invalid label and stringified numeric grounding branches', () => {
    expect(() => controller.tagClaim('BAD_LABEL' as never)).toThrow();
    const pack = controller.buildEvidencePack('m1', items, ['sec_10k'], []);
    const result = controller.validateGrounding(
      { note: 'value 999 here', assumption_text: 'estimate 123' },
      pack
    );
    if (result.isOk()) {
      expect(result.value.unsupportedNumbers).toContain(999);
      expect(result.value.unsupportedNumbers).not.toContain(123);
    }
  });

  it('downgrades sourceless FACT items and flags unsupported claim text', () => {
    const pack = controller.buildEvidencePack(
      'm2',
      [
        {
          id: 'e4',
          mission_id: 'm2',
          claim_text: 'Revenue doubled',
          claim_label: 'FACT' as const,
          challenged: false,
          created_at: new Date().toISOString(),
        },
      ],
      ['123' as unknown as string],
      [
        {
          field: 'shares_outstanding',
          impact: 'missing',
          severity: 'high' as const,
        },
      ]
    );
    expect(pack.items[0]?.claim_label).toBe('UNVERIFIED');
    const grounded = controller.validateGrounding(
      { summary: 'Revenue tripled' },
      pack
    );
    if (grounded.isOk()) {
      expect(grounded.value.unsupportedClaims).toContain('Revenue tripled');
    }
  });

  it('validates numeric grounding', () => {
    const pack = controller.buildEvidencePack('m1', items, ['sec_10k'], []);
    const grounded = controller.validateGrounding(
      { revenue: 400000000, margin: 20 },
      pack
    );
    expect(grounded.isOk()).toBe(true);
    if (grounded.isOk()) {
      expect(grounded.value.valid).toBe(true);
    }
    const ungrounded = controller.validateGrounding({ revenue: 999 }, pack);
    if (ungrounded.isOk()) {
      expect(ungrounded.value.valid).toBe(false);
      expect(ungrounded.value.unsupportedNumbers).toContain(999);
    }
  });
});
