import { describe, expect, it } from 'vitest';
import { HumanGate } from '../src/human-gate';

describe('HumanGate', () => {
  const gate = new HumanGate();
  const request = {
    mission_id: 'm1',
    gate_name: 'Gate3',
    gate_type: 'MANDATORY' as const,
    triggered_after_state: 'SYNTHESIZING' as const,
    reason_text: 'Final approval required',
    evidence_summary: 'Strong evidence',
    data_gaps: [
      { field: 'capex', impact: 'missing', severity: 'critical' as const },
    ],
    available_actions: ['confirm', 'revise'],
    wait_seconds: 60,
  };

  it('formats message content', () => {
    const message = gate.formatMessage(request);
    expect(message).toContain('Gate3');
    expect(message).toContain('capex');
  });

  it('resolves mandatory, optional, conditional, and auto-proceed gates', () => {
    const mandatory = gate.resolve(request, () => 'confirm');
    expect(mandatory.isOk()).toBe(true);
    if (mandatory.isOk()) expect(mandatory.value.action).toBe('confirm');

    const optional = gate.resolve({
      ...request,
      gate_type: 'OPTIONAL',
      available_actions: ['skip'],
    });
    if (optional.isOk()) expect(optional.value.auto_proceeded).toBe(true);

    const conditional = gate.resolve({
      ...request,
      gate_type: 'CONDITIONAL',
      available_actions: ['review'],
    });
    if (conditional.isOk()) expect(conditional.value.action).toBe('review');

    const auto = gate.resolve({
      ...request,
      gate_type: 'AUTO_PROCEED',
      available_actions: ['proceed'],
    });
    if (auto.isOk()) expect(auto.value.auto_proceeded).toBe(true);
  });
});
