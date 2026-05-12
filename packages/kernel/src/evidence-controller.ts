import { ok, type Result } from 'neverthrow';
import { loadDomainConfig } from './loaders';
import type { ClaimLabel, DataGap, EvidenceItem, EvidencePack } from './types';

export class EvidenceController {
  buildEvidencePack(
    missionId: string,
    items: EvidenceItem[],
    requiredDocumentsPresent: string[],
    criticalDataGaps: DataGap[]
  ): EvidencePack {
    const domain = loadDomainConfig();
    if (domain.isErr()) {
      throw domain.error;
    }
    const normalizedItems = items.map((item) =>
      item.claim_label === 'FACT' && (!item.source_name || !item.source_tier)
        ? { ...item, claim_label: 'UNVERIFIED' as const }
        : item
    );
    const normalizedDocuments = requiredDocumentsPresent.map((item) =>
      String(item)
    );
    const normalizedDataGaps = criticalDataGaps.map((gap) => ({
      field: String(gap.field),
      impact: String(gap.impact),
      severity: gap.severity,
      suggested_action: gap.suggested_action,
    }));
    const score = this.calculateEvidenceScore(
      normalizedItems,
      normalizedDocuments,
      normalizedDataGaps
    );
    return {
      mission_id: missionId,
      items: normalizedItems,
      required_documents_present: normalizedDocuments,
      critical_data_gaps: normalizedDataGaps,
      score,
      thresholds: {
        proceed: domain.value.evidence_requirements.proceed_threshold,
        humanReview: domain.value.evidence_requirements.human_review_threshold,
        abortRecommend:
          domain.value.evidence_requirements.abort_recommend_threshold,
      },
    };
  }

  tagClaim(label: ClaimLabel): ClaimLabel {
    const allowed: ClaimLabel[] = [
      'FACT',
      'DERIVED',
      'ASSUMPTION',
      'ESTIMATE',
      'UNVERIFIED',
      'MANAGEMENT_CLAIM',
      'MARKET_EXPECTATION',
    ];
    if (!allowed.includes(label)) {
      throw new Error(`Unsupported claim label: ${label}`);
    }
    return label;
  }

  calculateEvidenceScore(
    items: EvidenceItem[],
    requiredDocumentsPresent: string[],
    criticalDataGaps: DataGap[]
  ): number {
    const tier1 = Math.min(
      items.filter((item) => item.source_tier === 'tier_1').length * 25,
      50
    );
    const tier2 = Math.min(
      items.filter((item) => item.source_tier === 'tier_2').length * 10,
      20
    );
    const tier3 = Math.min(
      items.filter((item) => item.source_tier === 'tier_3').length * 5,
      10
    );
    const requiredDocsBonus = requiredDocumentsPresent.length > 0 ? 10 : 0;
    const noGapBonus = criticalDataGaps.length === 0 ? 10 : 0;
    const gapPenalty = criticalDataGaps.length * 15;
    const tier5OnlyPenalty =
      items.length > 0 && items.every((item) => item.source_tier === 'tier_5')
        ? 20
        : 0;
    return Math.max(
      0,
      tier1 +
        tier2 +
        tier3 +
        requiredDocsBonus +
        noGapBonus -
        gapPenalty -
        tier5OnlyPenalty
    );
  }

  trackDataGaps(
    requiredFields: string[],
    discoveredFields: string[]
  ): DataGap[] {
    return requiredFields
      .filter((field) => !discoveredFields.includes(field))
      .map((field) => ({
        field,
        impact: `${field} missing from evidence pack`,
        severity: 'critical' as const,
        suggested_action: `Collect ${field} before analysis`,
      }));
  }

  validateGrounding(
    output: Record<string, unknown>,
    evidencePack: EvidencePack
  ): Result<
    {
      valid: boolean;
      unsupportedNumbers: number[];
      unsupportedClaims: string[];
    },
    never
  > {
    const supportedValues = new Set(
      evidencePack.items
        .map((item) => item.numeric_value)
        .filter((value): value is number => value !== undefined)
    );
    const unsupportedNumbers: number[] = [];
    const unsupportedClaims: string[] = [];
    const supportedPhrases = new Set(
      evidencePack.items
        .flatMap((item) => [item.claim_text, item.source_name ?? ''])
        .map((item) => item.toLowerCase())
    );
    const visit = (value: unknown, parentKey?: string): void => {
      if (typeof value === 'number') {
        const key = parentKey?.toLowerCase() ?? '';
        const estimateKeys = [
          'assumptions',
          'assumption',
          'estimate',
          'estimates',
          'key_assumptions',
        ];
        const isEstimate = estimateKeys.some((segment) =>
          key.includes(segment)
        );
        if (!isEstimate && !supportedValues.has(value)) {
          unsupportedNumbers.push(value);
        }
        return;
      }
      if (typeof value === 'string') {
        const key = parentKey?.toLowerCase() ?? '';
        const claimLikeKeys = new Set([
          'claim',
          'summary',
          'business_story',
          'moat_summary',
          'owner_fit_summary',
          'downside_case_summary',
          'risk_reward_summary',
          'thesis',
          'conclusion',
          'recommendation',
        ]);
        if (claimLikeKeys.has(key)) {
          const normalized = value.toLowerCase();
          const groundedText = Array.from(supportedPhrases).some(
            (phrase) => phrase && normalized === phrase
          );
          if (!groundedText) {
            unsupportedClaims.push(value);
          }
        }
        for (const match of value.matchAll(/-?\d+(?:\.\d+)?/g)) {
          const parsed = Number(match[0]);
          const key = parentKey?.toLowerCase() ?? '';
          const estimateKeys = [
            'assumptions',
            'assumption',
            'estimate',
            'estimates',
            'key_assumptions',
          ];
          const ignoredStringKeys = new Set(['id', 'section', 'source_name']);
          const isEstimate = estimateKeys.some((segment) =>
            key.includes(segment)
          );
          if (
            !isEstimate &&
            !ignoredStringKeys.has(key) &&
            !supportedValues.has(parsed)
          ) {
            unsupportedNumbers.push(parsed);
          }
        }
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => visit(entry, parentKey));
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
          visit(
            nested,
            parentKey ? `${parentKey}.${key.toLowerCase()}` : key.toLowerCase()
          );
        }
      }
    };
    visit(output);
    return ok({
      valid: unsupportedNumbers.length === 0 && unsupportedClaims.length === 0,
      unsupportedNumbers,
      unsupportedClaims,
    });
  }

  recommendAction(pack: EvidencePack): 'proceed' | 'human_review' | 'abort' {
    if (pack.score < pack.thresholds.abortRecommend) return 'abort';
    if (pack.score < pack.thresholds.humanReview) return 'human_review';
    return 'proceed';
  }
}
