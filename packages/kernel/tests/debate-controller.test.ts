import { describe, expect, it } from 'vitest';
import { DebateController } from '../src/debate-controller';

describe('DebateController', () => {
  const controller = new DebateController();
  const challenge = {
    thread_id: 'thread-1',
    round_number: 1,
    challenger_id: 'damodaran-valuation',
    responder_id: 'klarman-downside',
    challenged_claim: 'Growth can sustain 12%',
    challenge_reason: 'Counter evidence from filings',
    counter_evidence: [
      {
        claim: 'Growth decelerated',
        source_name: '10-K',
        source_tier: 'tier_1' as const,
        label: 'FACT' as const,
      },
    ],
  };

  it('validates proper challenges and evidence request loop limits', () => {
    expect(controller.validateChallenge(challenge).isOk()).toBe(true);
    expect(controller.canRequestMoreEvidence(2)).toBe(true);
    expect(controller.canRequestMoreEvidence(3)).toBe(false);
  });

  it('rejects malformed challenges and excessive rounds', () => {
    expect(
      controller
        .validateChallenge({ ...challenge, challenged_claim: '' })
        .isErr()
    ).toBe(true);
    expect(
      controller.validateChallenge({ ...challenge, round_number: 4 }).isErr()
    ).toBe(true);
  });

  it('records all resolution states and preserves disagreement', () => {
    const resolved = controller.recordResolution(
      'm1',
      challenge,
      'RESOLVED',
      'accepted'
    );
    expect(resolved.unresolved).toBe(false);
    const partial = controller.recordResolution(
      'm1',
      challenge,
      'PARTIAL',
      'needs more evidence'
    );
    expect(partial.unresolved).toBe(true);
    const unresolved = controller.recordResolution(
      'm1',
      challenge,
      'UNRESOLVED',
      'deadlock'
    );
    expect(unresolved.status).toBe('UNRESOLVED');

    const preserved = controller.preserveDisagreement([
      { view: 'bull' },
      { view: 'bear' },
    ]);
    expect(preserved.consensus).toEqual({ view: 'bull' });
    expect(preserved.disagreements).toEqual([{ view: 'bear' }]);
  });
});
