import { describe, expect, it } from 'vitest';
import { ConstitutionEnforcer } from '../src/constitution-enforcer';

describe('ConstitutionEnforcer', () => {
  const enforcer = new ConstitutionEnforcer();

  it('fires BLOCK_MISSION for missing normalized earnings', () => {
    const result = enforcer.evaluate({
      agent_id: 'damodaran-valuation',
      pipeline_point: 'analysis',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.blocked).toBe(true);
      expect(
        result.value.violations.some(
          (item) => item.rule_id === 'no_analysis_without_normalized_earnings'
        )
      ).toBe(true);
    }
  });

  it('fires REJECT_OUTPUT for direct buy/sell language and unsupported FACT claims', () => {
    const result = enforcer.evaluate({
      agent_id: 'cio-synthesizer',
      pipeline_point: 'synthesis',
      output_text: 'You should buy now',
      claims: [
        {
          id: 'e1',
          mission_id: 'm1',
          claim_text: 'Revenue is 400000000',
          claim_label: 'FACT',
          challenged: false,
          created_at: new Date().toISOString(),
        },
      ],
    });
    if (result.isOk()) {
      expect(result.value.rejected_output).toBe(true);
      expect(
        result.value.violations.some(
          (item) => item.rule_id === 'no_buy_sell_recommendation'
        )
      ).toBe(true);
      expect(
        result.value.violations.some(
          (item) => item.rule_id === 'evidence_required_for_all_facts'
        )
      ).toBe(true);
    }
  });

  it('fires INSERT_HUMAN_REVIEW for data gaps and low evidence score', () => {
    const result = enforcer.evaluate({
      agent_id: 'researcher-us',
      pipeline_point: 'research',
      evidence_score: 20,
      data_gaps: [{ field: 'capex' }],
    });
    if (result.isOk()) {
      expect(result.value.requires_human_review).toBe(true);
      expect(
        result.value.violations.some(
          (item) => item.rule_id === 'data_gap_must_surface'
        )
      ).toBe(true);
      expect(
        result.value.violations.some(
          (item) => item.rule_id === 'low_evidence_score_gate'
        )
      ).toBe(true);
    }
  });

  it('fires WARN_AND_FLAG when uncertainty is not explicit', () => {
    const result = enforcer.evaluate({
      agent_id: 'pro-investor',
      pipeline_point: 'analysis',
      assumptions: [{ name: 'growth' }],
    });
    if (result.isOk()) {
      expect(
        result.value.warnings.some(
          (item) => item.rule_id === 'uncertainty_must_be_explicit'
        )
      ).toBe(true);
    }
  });

  it('honors owner override exception for low evidence score', () => {
    const result = enforcer.evaluate({
      agent_id: 'researcher-us',
      pipeline_point: 'research',
      evidence_score: 10,
      owner_explicit_override: true,
    });
    if (result.isOk()) {
      expect(
        result.value.violations.some(
          (item) => item.rule_id === 'low_evidence_score_gate'
        )
      ).toBe(false);
    }
  });
});
