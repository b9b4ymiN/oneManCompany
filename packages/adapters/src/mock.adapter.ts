import { err, ok, type Result } from 'neverthrow';
import type { AgentId } from '@onemancompany/kernel';

export interface MockAdapterRequest {
  mission_id: string;
  agent_id: AgentId;
  mode?: 'success' | 'timeout' | 'adapter_error';
}

export interface MockAdapterSuccess {
  status: 'success';
  output: Record<string, unknown>;
}

export interface MockAdapterFailure {
  status: 'timeout' | 'adapter_error';
  partial_output: Record<string, unknown> | null;
  error_reason: string;
}

const baseEvidence = [
  {
    claim: 'Revenue was 400000000',
    source_name: 'Mock 10-K',
    source_tier: 'tier_1',
    label: 'FACT',
  },
];

function buildFixture(
  missionId: string,
  agentId: AgentId
): Record<string, unknown> {
  const base = {
    agent_id: agentId,
    mission_id: missionId,
    summary: `${agentId} mock summary`,
    evidence_score: 82,
    evidence_used: baseEvidence,
    data_gaps: [],
    assumptions: [
      {
        name: 'base growth',
        value: 0.08,
        sensitivity: 'margin of safety',
        rationale: 'Mock assumption',
        evidence: [],
      },
    ],
    open_questions: [],
    thesis_breakers: ['Demand collapse'],
  };

  const byAgent: Record<AgentId, Record<string, unknown>> = {
    'researcher-set': {
      ...base,
      market: 'thai-set',
      source_log: baseEvidence,
      documents_collected: ['annual_report_56_1'],
      normalized_company_facts: baseEvidence,
      evidence_pack_status: 'complete',
      recommended_next_step: 'proceed',
    },
    'researcher-us': {
      ...base,
      market: 'us-nasdaq',
      source_log: baseEvidence,
      filings_collected: ['sec_10k', 'sec_10q'],
      evidence_pack_status: 'complete',
      recommended_next_step: 'proceed',
    },
    'forensic-accountant': {
      ...base,
      reported_profit: 390000000,
      one_off_items: [
        {
          item: 'one-off expense',
          amount: 10000000,
          treatment: 'exclude',
          evidence: baseEvidence,
        },
      ],
      normalized_earnings_base: 400000000,
      cashflow_quality: 'high',
      normalized_earnings_confidence: 'high',
      conviction_level: 8,
      conviction_reasoning: 'Cash conversion is strong',
    },
    'damodaran-valuation': {
      ...base,
      fair_value_conservative: 50,
      fair_value_base: 65,
      fair_value_optimistic: 80,
      implied_growth_at_market_price: 0.12,
      key_assumptions: [base.assumptions[0]],
      what_would_change_my_mind: ['Revenue stagnation'],
      data_gaps_found: [],
      reverse_dcf_summary: 'Market implies durable growth',
      conviction_level: 7,
      conviction_reasoning: 'DCF remains attractive',
    },
    'klarman-downside': {
      ...base,
      downside_case_summary: 'Downside manageable',
      bear_case_value: 42,
      margin_of_safety_required_pct: 30,
      key_risks_ranked: [
        { risk: 'recession', severity: 'high', evidence: baseEvidence },
      ],
      what_breaks_the_case: ['Leverage spike'],
      conviction_level: 7,
      conviction_reasoning: 'Balance sheet is acceptable',
    },
    'peter-lynch-story': {
      ...base,
      business_story: 'Simple compounder',
      growth_category: 'stalwart',
      moat_summary: 'Distribution moat',
      what_to_watch: ['same-store sales'],
      conviction_level: 7,
      conviction_reasoning: 'Narrative and operations align',
    },
    'hf-manager': {
      ...base,
      catalyst_map: ['earnings beat'],
      risk_reward_summary: 'Good skew',
      suggested_position_size_pct: 4,
      timing_window: 'next quarter',
      conviction_level: 6,
      conviction_reasoning: 'Catalyst path exists',
    },
    'technical-analyst': {
      ...base,
      trend_state: 'uptrend',
      setup_summary: 'Breakout above range',
      support_levels: [35, 37],
      resistance_levels: [45, 50],
      conviction_level: 6,
      conviction_reasoning: 'Trend is constructive',
    },
    'portfolio-allocator': {
      ...base,
      portfolio_fit_summary: 'Fits barbell sleeve',
      suggested_position_size_pct: 5,
      sizing_rationale: 'Low correlation',
      correlation_notes: ['Limited overlap with current holdings'],
      conviction_level: 7,
      conviction_reasoning: 'Risk budget allows addition',
    },
    'pro-investor': {
      ...base,
      checklist_results: [{ item: 'owner circle of competence', passed: true }],
      owner_fit_summary: 'Matches owner framework',
      conviction_level: 8,
      conviction_reasoning: 'High owner fit',
    },
    'cio-synthesizer': {
      ...base,
      decision_state: 'CORE_CANDIDATE',
      fair_value_conservative: 50,
      price_to_watch: 44,
      follow_up_events: ['Track next filing'],
      preserved_disagreements: [
        'Timing differs between HF and technical views',
      ],
      analyst_views: ['Valuation attractive', 'Downside acceptable'],
      conviction_level: 7,
      conviction_reasoning: 'Overall evidence clears threshold',
    },
    'book-master': {
      ...base,
      report_title: 'MOCK_STOCK investment memo',
      executive_summary: 'Structured final memo',
      decision_state: 'CORE_CANDIDATE',
      report_sections: [
        { heading: 'Decision', content: 'Candidate with caveats' },
      ],
    },
  };
  return byAgent[agentId];
}

export class MockAdapter {
  execute(
    request: MockAdapterRequest
  ): Result<MockAdapterSuccess | MockAdapterFailure, Error> {
    const fixture = buildFixture(request.mission_id, request.agent_id);
    if (request.mode === 'timeout') {
      return ok({
        status: 'timeout',
        partial_output: { ...fixture, partial: true },
        error_reason: 'Simulated timeout',
      });
    }
    if (request.mode === 'adapter_error') {
      return ok({
        status: 'adapter_error',
        partial_output: { ...fixture, partial: true },
        error_reason: 'Simulated adapter error',
      });
    }
    if (
      request.mode &&
      !['success', 'timeout', 'adapter_error'].includes(request.mode)
    ) {
      return err(new Error(`Unsupported mode ${request.mode}`));
    }
    return ok({ status: 'success', output: fixture });
  }
}
