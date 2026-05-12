import { ClaudeAdapter } from './claude.adapter';
import { CodexAdapter } from './codex.adapter';
import { GeminiAdapter } from './gemini.adapter';
import { MockAdapter } from './mock.adapter';
import { PythonAdapter } from './python.adapter';
import type { HealthReport, RuntimeAdapter } from './base';
import { ZAIAdapter } from './zai.adapter';

export class HealthMonitor {
  readonly adapters: RuntimeAdapter[];

  constructor(
    adapters: RuntimeAdapter[] = [
      new GeminiAdapter(),
      new ClaudeAdapter(),
      new CodexAdapter(),
      new ZAIAdapter(),
      new PythonAdapter(),
      new MockAdapter(),
    ]
  ) {
    this.adapters = adapters;
  }

  async run(): Promise<HealthReport> {
    const backends = await Promise.all(
      this.adapters.map(async (adapter) =>
        adapter.healthCheck
          ? await adapter.healthCheck()
          : {
              backend: adapter.backend,
              healthy: false,
              reason: 'Health check not implemented',
              critical: false,
            }
      )
    );
    return {
      generated_at: new Date().toISOString(),
      backends,
    };
  }
}
