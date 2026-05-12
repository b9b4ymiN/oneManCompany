import { loadAgentRegistryCards } from '@onemancompany/kernel';
import { err, ok, type Result } from 'neverthrow';
import { ClaudeAdapter } from './claude.adapter';
import { CodexAdapter } from './codex.adapter';
import { GeminiAdapter } from './gemini.adapter';
import { MockAdapter } from './mock.adapter';
import { PythonAdapter } from './python.adapter';
import type {
  AdapterExecutionTrace,
  BackendHealthStatus,
  RuntimeAdapter,
} from './base';
import { ZAIAdapter } from './zai.adapter';

export interface AdapterFactorySelection {
  adapter: RuntimeAdapter;
  model_id: string;
  trace: AdapterExecutionTrace[];
  excluded: boolean;
}

interface AdapterRegistry {
  gemini: RuntimeAdapter;
  claude: RuntimeAdapter;
  codex: RuntimeAdapter;
  zai: RuntimeAdapter;
  python: RuntimeAdapter;
  mock: RuntimeAdapter;
}

export class AdapterFactory {
  constructor(
    private readonly healthByBackend: Record<string, BackendHealthStatus>,
    private readonly adapterRegistry: AdapterRegistry = {
      gemini: new GeminiAdapter(),
      claude: new ClaudeAdapter(),
      codex: new CodexAdapter(),
      zai: new ZAIAdapter(),
      python: new PythonAdapter(),
      mock: new MockAdapter(),
    }
  ) {}

  resolve(agentId: string): Result<AdapterFactorySelection, Error> {
    const cardsResult = loadAgentRegistryCards();
    if (cardsResult.isErr()) {
      return err(cardsResult.error);
    }
    const card = cardsResult.value[agentId];
    if (!card) {
      return err(new Error(`Agent ${agentId} missing from registry`));
    }
    const trace: AdapterExecutionTrace[] = [];
    const candidateModels = [...card.model_preference, 'mock-default'];
    for (let index = 0; index < candidateModels.length; index += 1) {
      const modelId = candidateModels[index] as string;
      const adapter = this.adapterForModel(modelId);
      const health = this.healthByBackend[adapter.backend];
      if (!health || !health.healthy) {
        trace.push({
          adapter: adapter.backend,
          model_id: modelId,
          attempt: index + 1,
          outcome: 'failure',
          message:
            index === 0
              ? `primary failed, attempting fallback: ${health?.reason ?? 'missing health status'}`
              : `fallback failed, attempting next route: ${health?.reason ?? 'missing health status'}`,
        });
        continue;
      }
      trace.push({
        adapter: adapter.backend,
        model_id: modelId,
        attempt: index + 1,
        outcome: 'success',
        message: `selected ${adapter.backend}`,
      });
      return ok({ adapter, model_id: modelId, trace, excluded: false });
    }
    trace.push({
      adapter: 'none',
      model_id: 'none',
      attempt: candidateModels.length,
      outcome: 'skipped',
      message: 'all adapter routes exhausted; excluded and flagged',
    });
    return ok({
      adapter: this.adapterRegistry.mock,
      model_id: 'mock-default',
      trace,
      excluded: true,
    });
  }

  private adapterForModel(modelId: string): RuntimeAdapter {
    if (modelId.startsWith('gemini')) return this.adapterRegistry.gemini;
    if (modelId.startsWith('claude')) return this.adapterRegistry.claude;
    if (modelId.startsWith('codex')) return this.adapterRegistry.codex;
    if (modelId.startsWith('zai')) return this.adapterRegistry.zai;
    if (modelId.startsWith('python')) return this.adapterRegistry.python;
    return this.adapterRegistry.mock;
  }
}
