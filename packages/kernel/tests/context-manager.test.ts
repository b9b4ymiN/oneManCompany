import { describe, expect, it } from 'vitest';
import { ContextManager } from '../src/context-manager';

describe('ContextManager', () => {
  const manager = new ContextManager();
  const payload = {
    facts: ['Revenue grew'],
    sources: [
      {
        claim: 'Revenue 400000000',
        source_name: 'Mock 10-K',
        source_tier: 'tier_1' as const,
        label: 'FACT' as const,
        value: 400000000,
      },
    ],
    key_numbers: [400000000],
    data_gaps: [
      { field: 'capex', impact: 'missing', severity: 'critical' as const },
    ],
    financial_statements: ['income statement', 'cash flow'],
    business_model: 'subscription model',
    debate_records: ['debate one'],
    agent_output_summaries: ['summary one'],
    market_context: ['macro'],
    price_history: [1, 2, 3],
    owner_portfolio_context: ['portfolio'],
    owner_framework: ['quality'],
    verbose_notes: ['very long note'],
  };

  it('calculates budget warnings and compression thresholds', () => {
    const warn = manager.budgetTracker.getBudgetStatus('claude-opus', 150000);
    expect(warn.should_warn).toBe(true);
    const compress = manager.budgetTracker.getBudgetStatus(
      'claude-opus',
      170000
    );
    expect(compress.should_compress).toBe(true);
  });

  it('compresses while preserving facts, sources, numbers, and gaps', () => {
    const compressed = manager.compressor.compress(payload);
    expect(compressed.facts).toEqual(payload.facts);
    expect(compressed.sources).toEqual(payload.sources);
    expect(compressed.key_numbers).toEqual(payload.key_numbers);
    expect(compressed.data_gaps).toEqual(payload.data_gaps);
    expect(compressed.verbose_notes).toHaveLength(1);
  });

  it('distributes context by role without leaking unrelated sections', () => {
    const forensic = manager.distributor.distribute(payload, {
      id: 'forensic-accountant',
      context_share: 'financial_statements_and_notes',
    });
    expect(forensic.financial_statements).toEqual(payload.financial_statements);
    expect(forensic.business_model).toBeUndefined();

    const cio = manager.distributor.distribute(payload, {
      id: 'cio-synthesizer',
      context_share: 'agent_output_summaries_plus_debate_records',
    });
    expect(cio.agent_output_summaries).toEqual(payload.agent_output_summaries);
    expect(cio.debate_records).toEqual(payload.debate_records);
    expect(cio.financial_statements).toBeUndefined();
  });
});
