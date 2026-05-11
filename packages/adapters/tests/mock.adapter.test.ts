import { describe, expect, it } from 'vitest';
import { MockAdapter } from '../src/mock.adapter';

describe('MockAdapter', () => {
  const adapter = new MockAdapter();

  it('returns deterministic success fixtures', () => {
    const result = adapter.execute({
      mission_id: 'm1',
      agent_id: 'researcher-us',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('success');
      if (result.value.status === 'success') {
        expect(result.value.output.agent_id).toBe('researcher-us');
      }
    }
  });

  it('simulates timeout and adapter error states with partial output', () => {
    const timeout = adapter.execute({
      mission_id: 'm1',
      agent_id: 'cio-synthesizer',
      mode: 'timeout',
    });
    expect(timeout.isOk()).toBe(true);
    if (timeout.isOk() && timeout.value.status !== 'success') {
      expect(timeout.value.partial_output).not.toBeNull();
    }
    const adapterError = adapter.execute({
      mission_id: 'm1',
      agent_id: 'cio-synthesizer',
      mode: 'adapter_error',
    });
    expect(adapterError.isOk()).toBe(true);
    if (adapterError.isOk() && adapterError.value.status !== 'success') {
      expect(adapterError.value.error_reason).toContain('Simulated');
    }
  });
});
