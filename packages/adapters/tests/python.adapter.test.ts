import { describe, expect, it } from 'vitest';
import { PythonAdapter, DCFResultSchema } from '../src';

describe('PythonAdapter', () => {
  it('returns known DCF output within tolerance', async () => {
    const adapter = new PythonAdapter();
    const result = await adapter.execute({
      mission_id: 'm1',
      agent_id: 'damodaran-valuation',
      model_id: 'dcf',
      prompt: 'dcf',
      schema: DCFResultSchema,
      timeout_ms: 30000,
      metadata: {
        normalized_earnings: 400000000,
        growth_rates: [0.1, 0.1, 0.1],
        wacc: 0.09,
        terminal_growth: 0.025,
        shares_outstanding: 300000000,
      },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(
        result.value.output.fair_value_conservative
      ).toBeGreaterThanOrEqual(25);
      expect(result.value.output.fair_value_conservative).toBeLessThanOrEqual(
        45
      );
    }
  });
});
