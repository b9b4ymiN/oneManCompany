import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GeminiAdapter } from '../src';

describe('GeminiAdapter', () => {
  it('completes a live CLI call and validates JSON output', async () => {
    const adapter = new GeminiAdapter();
    const schema = z.object({ status: z.literal('ok'), model: z.string() });
    const result = await adapter.execute({
      mission_id: 'm1',
      agent_id: 'researcher-us',
      model_id: 'gemini-2-flash',
      prompt:
        'respond with JSON exactly: {"status":"ok","model":"gemini-2-flash"}',
      schema,
      timeout_ms: 60000,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.output.status).toBe('ok');
      expect(result.value.raw_text).toContain('gemini-2-flash');
    }
  });
});
