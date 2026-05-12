import { describe, expect, it } from 'vitest';
import { AdapterFactory, HealthMonitor } from '../src';

describe('HealthMonitor and AdapterFactory', () => {
  it('reports backend health with at least one healthy backend', async () => {
    const report = await new HealthMonitor().run();
    expect(report.backends.some((backend) => backend.healthy)).toBe(true);
  });

  it('routes to fallback when primary backend is unhealthy', () => {
    const factory = new AdapterFactory({
      claude: {
        backend: 'claude',
        healthy: false,
        reason: 'down',
        critical: false,
      },
      zai: { backend: 'zai', healthy: true, reason: 'ok', critical: false },
      'gemini-cli': {
        backend: 'gemini-cli',
        healthy: true,
        reason: 'ok',
        critical: true,
      },
      python: {
        backend: 'python',
        healthy: true,
        reason: 'ok',
        critical: true,
      },
      mock: { backend: 'mock', healthy: true, reason: 'ok', critical: false },
      codex: { backend: 'codex', healthy: true, reason: 'ok', critical: false },
    });
    const result = factory.resolve('damodaran-valuation');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(
        result.value.trace.some((item) => item.message.includes('fallback'))
      ).toBe(true);
    }
    const fallbackResult = factory.resolve('book-master');
    expect(fallbackResult.isOk()).toBe(true);
  });
});
