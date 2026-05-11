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
    const score = this.calculateEvidenceScore(
      items,
      requiredDocumentsPresent,
      criticalDataGaps
    );
    return {
      mission_id: missionId,
      items,
      required_documents_present: requiredDocumentsPresent,
      critical_data_gaps: criticalDataGaps,
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
      items.length > 0 &&
      items.every((item) => item.source_tier === 'tier_5') &&
      items.every(
        (item) =>
          item.source_tier !== 'tier_1' &&
          item.source_tier !== 'tier_2' &&
          item.source_tier !== 'tier_3'
      )
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
  ): Result<{ valid: boolean; unsupportedNumbers: number[] }, never> {
    const supportedValues = new Set(
      evidencePack.items
        .map((item) => item.numeric_value)
        .filter((value): value is number => value !== undefined)
    );
    const unsupportedNumbers: number[] = [];
    const visit = (value: unknown, parentKey?: string): void => {
      if (typeof value === 'number') {
        const isEstimate =
          parentKey?.includes('assumption') || parentKey?.includes('estimate');
        if (!isEstimate && !supportedValues.has(value)) {
          unsupportedNumbers.push(value);
        }
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => visit(entry, parentKey));
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
          visit(nested, key.toLowerCase());
        }
      }
    };
    visit(output);
    return ok({ valid: unsupportedNumbers.length === 0, unsupportedNumbers });
  }

  recommendAction(pack: EvidencePack): 'proceed' | 'human_review' | 'abort' {
    if (pack.score < pack.thresholds.abortRecommend) return 'abort';
    if (pack.score < pack.thresholds.humanReview) return 'human_review';
    return 'proceed';
  }
}
