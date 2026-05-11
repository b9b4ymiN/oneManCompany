import crypto from 'node:crypto';
import { err, ok, type Result } from 'neverthrow';
import type {
  DebateChallenge,
  DebateResolution,
  DebateResolutionStatus,
} from './types';

export class DebateController {
  readonly maxRounds = 3;
  readonly maxEvidenceRequestRounds = 2;

  validateChallenge(
    challenge: DebateChallenge
  ): Result<DebateChallenge, Error> {
    if (!challenge.challenged_claim.trim()) {
      return err(new Error('Challenge must cite a specific claim'));
    }
    if (!challenge.challenge_reason.trim()) {
      return err(new Error('Challenge must include a reason'));
    }
    if (challenge.counter_evidence.length === 0) {
      return err(new Error('Challenge must include counter-evidence'));
    }
    if (challenge.round_number > this.maxRounds) {
      return err(new Error('Challenge exceeds max debate rounds'));
    }
    return ok(challenge);
  }

  canRequestMoreEvidence(round: number): boolean {
    return round <= this.maxEvidenceRequestRounds;
  }

  recordResolution(
    missionId: string,
    challenge: DebateChallenge,
    status: DebateResolutionStatus,
    resolutionNote: string
  ): DebateResolution {
    return {
      id: crypto.randomUUID(),
      mission_id: missionId,
      thread_id: challenge.thread_id,
      round_number: challenge.round_number,
      challenger_id: challenge.challenger_id,
      responder_id: challenge.responder_id,
      challenged_claim: challenge.challenged_claim,
      challenge_reason: challenge.challenge_reason,
      evidence_weighting_note:
        'Tier 1 > Tier 2 > Tier 3 > Tier 4 > Tier 5 > ESTIMATE',
      status,
      unresolved: status !== 'RESOLVED',
      resolution_note: resolutionNote,
      created_at: new Date().toISOString(),
    };
  }

  preserveDisagreement<T>(perspectives: T[]): {
    consensus: T | null;
    disagreements: T[];
  } {
    if (perspectives.length === 0) {
      return { consensus: null, disagreements: [] };
    }
    return {
      consensus: perspectives[0] ?? null,
      disagreements: perspectives.slice(1),
    };
  }
}
