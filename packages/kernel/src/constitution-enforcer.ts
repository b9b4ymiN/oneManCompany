import { err, ok, type Result } from 'neverthrow';
import { loadConstitution } from './loaders';
import type {
  ConstitutionEvaluationResult,
  ConstitutionViolation,
  EvidenceItem,
} from './types';

export interface ConstitutionPayload {
  agent_id: string;
  pipeline_point: string;
  normalized_earnings_base?: number;
  evidence_score?: number;
  owner_explicit_override?: boolean;
  claims?: EvidenceItem[];
  output_text?: string;
  data_gaps?: Array<{ field: string }>;
  assumptions?: Array<{ name: string; sensitivity?: string }>;
}

export class ConstitutionEnforcer {
  evaluate(
    payload: ConstitutionPayload
  ): Result<ConstitutionEvaluationResult, Error> {
    const constitution = loadConstitution();
    if (constitution.isErr()) {
      return err(constitution.error);
    }
    const violations: ConstitutionViolation[] = [];
    const warnings: ConstitutionViolation[] = [];

    for (const rule of constitution.value.company_constitution) {
      const appliesTo = Array.isArray(rule.applies_to)
        ? rule.applies_to
        : [rule.applies_to];
      const createViolation = (): ConstitutionViolation => ({
        rule_id: rule.id,
        description: rule.description,
        enforcement: rule.enforcement,
        applies_to: rule.applies_to,
        exception: rule.exception,
        pipeline_point: payload.pipeline_point,
      });
      switch (rule.id) {
        case 'no_analysis_without_normalized_earnings':
          if (
            appliesTo.includes(payload.agent_id) &&
            payload.normalized_earnings_base === undefined
          ) {
            violations.push(createViolation());
          }
          break;
        case 'evidence_required_for_all_facts':
          if (
            payload.claims?.some(
              (claim) =>
                claim.claim_label === 'FACT' &&
                (!claim.source_name || !claim.source_tier)
            )
          ) {
            violations.push(createViolation());
          }
          break;
        case 'data_gap_must_surface':
          if (
            payload.pipeline_point === 'research' &&
            (payload.data_gaps?.length ?? 0) > 0
          ) {
            violations.push(createViolation());
          }
          break;
        case 'no_buy_sell_recommendation':
          if (/\b(buy|sell)\b/i.test(payload.output_text ?? '')) {
            violations.push(createViolation());
          }
          break;
        case 'low_evidence_score_gate':
          if (
            (payload.evidence_score ?? 100) < 40 &&
            !payload.owner_explicit_override
          ) {
            violations.push(createViolation());
          }
          break;
        case 'uncertainty_must_be_explicit':
          if (
            payload.assumptions?.some(
              (assumption) =>
                !assumption.sensitivity ||
                assumption.sensitivity.trim().length === 0
            )
          ) {
            warnings.push({
              ...createViolation(),
              pipeline_point: `${payload.pipeline_point}:warning`,
            });
          }
          break;
      }
    }

    return ok({
      blocked: violations.some((item) => item.enforcement === 'BLOCK_MISSION'),
      requires_human_review: violations.some(
        (item) => item.enforcement === 'INSERT_HUMAN_REVIEW'
      ),
      rejected_output: violations.some(
        (item) => item.enforcement === 'REJECT_OUTPUT'
      ),
      warnings,
      violations,
    });
  }
}
