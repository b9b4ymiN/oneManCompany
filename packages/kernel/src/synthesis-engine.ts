import { err, ok, type Result } from 'neverthrow';
import type { DecisionState, MissionOutputRequirements } from './types';

export interface SynthesisInput {
  agent_outputs: Array<
    Record<string, unknown> & {
      agent_id: string;
      decision_state?: DecisionState;
    }
  >;
  evidence_score: number;
  thesis_breakers: string[];
  follow_up_events: string[];
  disagreements: string[];
  output_requirements: MissionOutputRequirements;
}

export interface SynthesisResult extends Record<string, unknown> {
  decision_state: DecisionState;
  conviction_level: number;
  evidence_score: number;
  thesis_breakers: string[];
  follow_up_events: string[];
  preserved_disagreements: string[];
  analyst_views: string[];
}

export class SynthesisEngine {
  mapAgreement(outputs: SynthesisInput['agent_outputs']): {
    agreed: boolean;
    agreement_ratio: number;
  } {
    const decisionStates = outputs
      .map((output) => output.decision_state)
      .filter(Boolean);
    if (decisionStates.length === 0) {
      return { agreed: false, agreement_ratio: 0 };
    }
    const counts = new Map<DecisionState, number>();
    for (const state of decisionStates) {
      counts.set(
        state as DecisionState,
        (counts.get(state as DecisionState) ?? 0) + 1
      );
    }
    const max = Math.max(...counts.values());
    const ratio = max / decisionStates.length;
    return { agreed: ratio >= 0.75, agreement_ratio: ratio };
  }

  determineDecisionState(
    outputs: SynthesisInput['agent_outputs']
  ): DecisionState {
    const agreement = this.mapAgreement(outputs);
    if (!agreement.agreed) {
      return 'RESEARCH_MORE';
    }
    return (outputs.find((output) => output.decision_state)?.decision_state ??
      'WATCH') as DecisionState;
  }

  assemble(input: SynthesisInput): SynthesisResult {
    const fairValueConservative = Number(
      input.agent_outputs.find(
        (output) => typeof output.fair_value_conservative === 'number'
      )?.fair_value_conservative ?? 0
    );
    const normalizedEarningsBase = Number(
      input.agent_outputs.find(
        (output) => typeof output.normalized_earnings_base === 'number'
      )?.normalized_earnings_base ?? 0
    );
    const priceToWatch = Number(
      input.agent_outputs.find(
        (output) => typeof output.price_to_watch === 'number'
      )?.price_to_watch ?? 0
    );
    return {
      decision_state: this.determineDecisionState(input.agent_outputs),
      conviction_level: 7,
      evidence_score: input.evidence_score,
      thesis_breakers: input.thesis_breakers,
      follow_up_events: input.follow_up_events,
      preserved_disagreements: input.disagreements,
      analyst_views: input.agent_outputs.map((output) =>
        String(output.summary ?? output.agent_id)
      ),
      normalized_earnings_base: normalizedEarningsBase,
      fair_value_conservative: fairValueConservative,
      price_for_mos_30: fairValueConservative * 0.7,
      price_to_watch: priceToWatch,
    };
  }

  validateMandatoryFields(
    output: Record<string, unknown>,
    requirements: MissionOutputRequirements
  ): Result<true, Error> {
    const missing = requirements.mandatory_fields.filter(
      (field) => output[field] === undefined || output[field] === null
    );
    if (missing.length > 0) {
      return err(
        new Error(`Missing mandatory synthesis fields: ${missing.join(', ')}`)
      );
    }
    return ok(true);
  }
}
