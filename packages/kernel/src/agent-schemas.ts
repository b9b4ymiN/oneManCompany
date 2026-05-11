import { z } from 'zod';
import {
  AssumptionItemSchema,
  ConvictionBlockSchema,
  DataGapSchema,
  DecisionStateSchema,
  EvidenceRefSchema,
  SharedAgentEnvelopeSchema,
} from './types';

const reportSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
});

export const ResearcherSetOutputSchema = SharedAgentEnvelopeSchema.extend({
  market: z.literal('thai-set'),
  source_log: z.array(EvidenceRefSchema).min(1),
  documents_collected: z.array(z.string()).min(1),
  normalized_company_facts: z.array(EvidenceRefSchema).min(1),
  evidence_pack_status: z.enum(['complete', 'partial', 'insufficient']),
  recommended_next_step: z.enum(['proceed', 'human_review', 'abort']),
});

export const ResearcherUsOutputSchema = SharedAgentEnvelopeSchema.extend({
  market: z.enum(['us-nyse', 'us-nasdaq']),
  source_log: z.array(EvidenceRefSchema).min(1),
  filings_collected: z.array(z.string()).min(1),
  evidence_pack_status: z.enum(['complete', 'partial', 'insufficient']),
  recommended_next_step: z.enum(['proceed', 'human_review', 'abort']),
});

export const ForensicAccountantOutputSchema = SharedAgentEnvelopeSchema.extend({
  reported_profit: z.number(),
  one_off_items: z.array(
    z.object({
      item: z.string(),
      amount: z.number(),
      treatment: z.enum(['exclude', 'include', 'monitor']),
      evidence: z.array(EvidenceRefSchema).min(1),
    })
  ),
  normalized_earnings_base: z.number(),
  cashflow_quality: z.enum(['high', 'medium', 'low', 'negative']),
  normalized_earnings_confidence: z.enum(['high', 'medium', 'low']),
}).merge(ConvictionBlockSchema);

export const DamodaranValuationOutputSchema = SharedAgentEnvelopeSchema.extend({
  fair_value_conservative: z.number(),
  fair_value_base: z.number(),
  fair_value_optimistic: z.number(),
  implied_growth_at_market_price: z.number(),
  key_assumptions: z.array(AssumptionItemSchema).min(1),
  what_would_change_my_mind: z.array(z.string()).min(1),
  data_gaps_found: z.array(DataGapSchema),
  reverse_dcf_summary: z.string(),
}).merge(ConvictionBlockSchema);

export const KlarmanDownsideOutputSchema = SharedAgentEnvelopeSchema.extend({
  downside_case_summary: z.string(),
  bear_case_value: z.number(),
  margin_of_safety_required_pct: z.number(),
  key_risks_ranked: z
    .array(
      z.object({
        risk: z.string(),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
        evidence: z.array(EvidenceRefSchema).min(1),
      })
    )
    .min(1),
  what_breaks_the_case: z.array(z.string()).min(1),
}).merge(ConvictionBlockSchema);

export const PeterLynchStoryOutputSchema = SharedAgentEnvelopeSchema.extend({
  business_story: z.string(),
  growth_category: z.string(),
  moat_summary: z.string(),
  what_to_watch: z.array(z.string()).min(1),
}).merge(ConvictionBlockSchema);

export const HfManagerOutputSchema = SharedAgentEnvelopeSchema.extend({
  catalyst_map: z.array(z.string()).min(1),
  risk_reward_summary: z.string(),
  suggested_position_size_pct: z.number(),
  timing_window: z.string(),
}).merge(ConvictionBlockSchema);

export const TechnicalAnalystOutputSchema = SharedAgentEnvelopeSchema.extend({
  trend_state: z.string(),
  setup_summary: z.string(),
  support_levels: z.array(z.number()).min(1),
  resistance_levels: z.array(z.number()).min(1),
}).merge(ConvictionBlockSchema);

export const PortfolioAllocatorOutputSchema = SharedAgentEnvelopeSchema.extend({
  portfolio_fit_summary: z.string(),
  suggested_position_size_pct: z.number(),
  sizing_rationale: z.string(),
  correlation_notes: z.array(z.string()).default([]),
}).merge(ConvictionBlockSchema);

export const ProInvestorOutputSchema = SharedAgentEnvelopeSchema.extend({
  checklist_results: z
    .array(z.object({ item: z.string(), passed: z.boolean() }))
    .min(1),
  owner_fit_summary: z.string(),
}).merge(ConvictionBlockSchema);

export const CioSynthesizerOutputSchema = SharedAgentEnvelopeSchema.extend({
  decision_state: DecisionStateSchema,
  fair_value_conservative: z.number(),
  price_to_watch: z.number(),
  follow_up_events: z.array(z.string()).min(1),
  preserved_disagreements: z.array(z.string()).default([]),
  analyst_views: z.array(z.string()).min(1),
}).merge(ConvictionBlockSchema);

export const BookMasterOutputSchema = SharedAgentEnvelopeSchema.extend({
  report_title: z.string(),
  executive_summary: z.string(),
  decision_state: DecisionStateSchema,
  report_sections: z.array(reportSectionSchema).min(1),
});

export const AgentOutputSchemas = {
  'researcher-set': ResearcherSetOutputSchema,
  'researcher-us': ResearcherUsOutputSchema,
  'forensic-accountant': ForensicAccountantOutputSchema,
  'damodaran-valuation': DamodaranValuationOutputSchema,
  'klarman-downside': KlarmanDownsideOutputSchema,
  'peter-lynch-story': PeterLynchStoryOutputSchema,
  'hf-manager': HfManagerOutputSchema,
  'technical-analyst': TechnicalAnalystOutputSchema,
  'portfolio-allocator': PortfolioAllocatorOutputSchema,
  'pro-investor': ProInvestorOutputSchema,
  'cio-synthesizer': CioSynthesizerOutputSchema,
  'book-master': BookMasterOutputSchema,
} as const;

export type AgentId = keyof typeof AgentOutputSchemas;
export type AgentOutput = {
  [K in AgentId]: z.infer<(typeof AgentOutputSchemas)[K]>;
}[AgentId];
