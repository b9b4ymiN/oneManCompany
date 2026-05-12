import { describe, expect, it } from 'vitest';
import { ParallelRunner } from '../src/parallel-runner';

describe('ParallelRunner', () => {
  it('returns successes and partial failures without aborting', async () => {
    const runner = new ParallelRunner();
    const result = await runner.run([
      { agent_id: 'a', timeout_ms: 1000, run: async () => ({ ok: true }) },
      {
        agent_id: 'b',
        timeout_ms: 5,
        run: async () => {
          await new Promise((r) => setTimeout(r, 20));
          return { slow: true };
        },
      },
      {
        agent_id: 'c',
        timeout_ms: 1000,
        run: async () => {
          throw new Error('boom');
        },
      },
    ]);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.successes).toHaveLength(1);
      expect(result.value.failures).toHaveLength(2);
    }
  });
});
