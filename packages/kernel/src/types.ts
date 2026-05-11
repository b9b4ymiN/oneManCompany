import { z } from 'zod';

export const missionStates = [
  'DRAFT',
  'PLANNING',
  'RESEARCHING',
  'HUMAN_REVIEW',
  'ANALYZING',
  'CROSS_QA',
  'DEBATING',
  'SYNTHESIZING',
  'DECIDED',
  'JOURNALED',
  'FAILED',
] as const;

export const MissionStateSchema = z.enum(missionStates);
export type MissionState = z.infer<typeof MissionStateSchema>;

export const ClaimLabelSchema = z.enum([
  'FACT',
  'DERIVED',
  'ASSUMPTION',
  'ESTIMATE',
  'UNVERIFIED',
  'MANAGEMENT_CLAIM',
  'MARKET_EXPECTATION',
]);
export type ClaimLabel = z.infer<typeof ClaimLabelSchema>;

export const SourceTierSchema = z.enum([
  'tier_1',
  'tier_2',
  'tier_3',
  'tier_4',
  'tier_5',
]);
export type SourceTier = z.infer<typeof SourceTierSchema>;

export const DecisionStateSchema = z.enum([
  'REJECT',
  'WATCH',
  'RESEARCH_MORE',
  'WAIT_FOR_PRICE',
  'STARTER_POSITION',
  'CORE_CANDIDATE',
  'ADD_ON_WEAKNESS',
  'HOLD',
  'TRIM',
  'EXIT_THESIS_BROKEN',
]);
export type DecisionState = z.infer<typeof DecisionStateSchema>;

export const EvidenceRefSchema = z.object({
  claim: z.string(),
  source_name: z.string(),
  source_tier: SourceTierSchema,
  label: ClaimLabelSchema,
  section: z.string().optional(),
  note: z.string().optional(),
  value: z.number().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const DataGapSchema = z.object({
  field: z.string(),
  impact: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  suggested_action: z.string().optional(),
});
export type DataGap = z.infer<typeof DataGapSchema>;

export const AssumptionItemSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  sensitivity: z.string(),
  rationale: z.string(),
  evidence: z.array(EvidenceRefSchema).default([]),
});
export type AssumptionItem = z.infer<typeof AssumptionItemSchema>;

export const SharedAgentEnvelopeSchema = z.object({
  agent_id: z.string(),
  mission_id: z.string(),
  summary: z.string(),
  evidence_score: z.number().min(0).max(100),
  evidence_used: z.array(EvidenceRefSchema).default([]),
  data_gaps: z.array(DataGapSchema).default([]),
  assumptions: z.array(AssumptionItemSchema).default([]),
  open_questions: z.array(z.string()).default([]),
  thesis_breakers: z.array(z.string()).default([]),
});
export type SharedAgentEnvelope = z.infer<typeof SharedAgentEnvelopeSchema>;

export const ConvictionBlockSchema = z.object({
  conviction_level: z.number().int().min(1).max(10),
  conviction_reasoning: z.string(),
});
export type ConvictionBlock = z.infer<typeof ConvictionBlockSchema>;

export interface MissionOutputRequirements {
  mandatory_fields: string[];
  mandatory_report_sections: string[];
  forbidden_content: string[];
}

export interface MissionEvidenceRequirements {
  minimum_tier_1_sources: number;
  minimum_total_sources: number;
  required_documents: string[];
  required_documents_by_source_group: Record<string, string[]>;
  critical_fields: string[];
  proceed_threshold: number;
  human_review_threshold: number;
  abort_recommend_threshold: number;
}

export interface HumanCheckpointConfig {
  mode: string;
  state: MissionState;
  gate_name: string;
  gate_type: string;
  triggered_after_state: MissionState;
  condition: string;
}

export interface MissionObject {
  mission_id: string;
  domain: string;
  mission_type: string;
  subject: {
    ticker: string;
    market: string;
    earnings_hint?: number;
  };
  owner_brief: string;
  required_agents: string[];
  evidence_requirements: MissionEvidenceRequirements;
  output_requirements: MissionOutputRequirements;
  human_checkpoints: HumanCheckpointConfig[];
  metadata: Record<string, string | number | boolean>;
}

export interface MissionPlanContext {
  brief?: string;
  teamReady?: boolean;
  evidenceRequirementsReady?: boolean;
  evidenceScore?: number;
  humanOverride?: boolean;
  mandatoryFieldsPresent?: boolean;
  journalValidated?: boolean;
  gateName?: string;
  analystOutputsComplete?: boolean;
  crossQaComplete?: boolean;
  debateRoundsCompleted?: number;
  reason?: string;
  partial_output?: unknown;
}

export interface TransitionRecord {
  from: MissionState;
  to: MissionState;
  at: string;
  reason?: string;
}

export interface TimeoutPolicy {
  researchingPerResearcherMs: number;
  analyzingPerAnalystMs: number;
  crossQaMs: number;
  synthesizingMs: number;
  autoProceedGateMs: number;
  maxDebateRounds: number;
}

export interface TimeoutCheckInput {
  state: MissionState;
  elapsedMs: number;
  participants?: number;
  roundCount?: number;
}

export interface TimeoutOutcome {
  timedOut: boolean;
  action:
    | 'none'
    | 'flag_partial_proceed'
    | 'skip_failed_agent'
    | 'proceed'
    | 'close_unresolved'
    | 'fail'
    | 'auto_proceed';
  nextState?: MissionState;
  reason?: string;
}

export interface MissionFailure {
  failing_state: MissionState;
  error_reason: string;
  partial_output?: unknown;
}

export interface AgentRegistryCard {
  id: string;
  name: string;
  role: string;
  persona: string;
  domain: string[];
  model_preference: string[];
  context_share: string;
  interaction_rules: Record<string, unknown>;
  output_schema_ref: string;
  mandatory_fields: string[];
}

export interface ExecutionPlanGroup {
  mode: 'sequential' | 'parallel' | 'single';
  agent_ids: string[];
}

export interface ExecutionPlan {
  mission_id: string;
  groups: ExecutionPlanGroup[];
  fallback_models: Record<string, string | null>;
  excluded_agents: string[];
  mission_log: string[];
}

export interface ContextPayload {
  facts: string[];
  sources: EvidenceRef[];
  key_numbers: number[];
  data_gaps: DataGap[];
  financial_statements?: string[];
  business_model?: string;
  debate_records?: string[];
  agent_output_summaries?: string[];
  market_context?: string[];
  price_history?: number[];
  owner_portfolio_context?: string[];
  owner_framework?: string[];
  verbose_notes?: string[];
}

export interface EvidenceItem {
  id: string;
  mission_id: string;
  agent_id?: string;
  claim_text: string;
  claim_label: ClaimLabel;
  source_name?: string;
  source_tier?: SourceTier;
  source_section?: string;
  source_url?: string;
  evidence_date?: string;
  used_by?: string[];
  challenged: boolean;
  note_text?: string;
  created_at: string;
  numeric_value?: number;
}

export interface EvidencePack {
  mission_id: string;
  items: EvidenceItem[];
  required_documents_present: string[];
  critical_data_gaps: DataGap[];
  score: number;
  thresholds: {
    proceed: number;
    humanReview: number;
    abortRecommend: number;
  };
}

export interface DebateChallenge {
  thread_id: string;
  round_number: number;
  challenger_id: string;
  responder_id: string;
  challenged_claim: string;
  challenge_reason: string;
  counter_evidence: EvidenceRef[];
}

export type DebateResolutionStatus = 'RESOLVED' | 'PARTIAL' | 'UNRESOLVED';

export interface DebateResolution {
  id: string;
  mission_id: string;
  thread_id: string;
  round_number: number;
  challenger_id: string;
  responder_id: string;
  challenged_claim: string;
  challenge_reason: string;
  evidence_weighting_note: string;
  status: DebateResolutionStatus;
  unresolved: boolean;
  resolution_note: string;
  created_at: string;
}

export interface HumanGateRequest {
  mission_id: string;
  gate_name: string;
  gate_type: 'MANDATORY' | 'CONDITIONAL' | 'OPTIONAL' | 'AUTO_PROCEED';
  triggered_after_state: MissionState;
  reason_text: string;
  evidence_summary: string;
  data_gaps: DataGap[];
  available_actions: string[];
  wait_seconds: number;
}

export interface ConstitutionViolation {
  rule_id: string;
  description: string;
  enforcement:
    | 'BLOCK_MISSION'
    | 'INSERT_HUMAN_REVIEW'
    | 'WARN_AND_FLAG'
    | 'REJECT_OUTPUT';
  applies_to: string | string[];
  exception: string;
  pipeline_point: string;
}

export interface ConstitutionEvaluationResult {
  blocked: boolean;
  requires_human_review: boolean;
  rejected_output: boolean;
  warnings: ConstitutionViolation[];
  violations: ConstitutionViolation[];
}

export interface JournalMissionRecord {
  id: string;
  domain_id: string;
  mission_type: string;
  subject_type: string;
  ticker?: string;
  market?: string;
  owner_brief: string;
  owner_assumption?: string;
  owner_constraint?: string;
  current_state: MissionState;
  final_state?: MissionState;
  status: string;
  evidence_score?: number;
  created_at: string;
  completed_at?: string;
  failed_at?: string;
  failure_reason?: string;
  metadata_json?: string;
}
