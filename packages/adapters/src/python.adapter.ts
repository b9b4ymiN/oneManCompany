import path from 'node:path';
import { err } from 'neverthrow';
import type { BackendHealthStatus, RuntimeAdapter } from './base';
import {
  parseJsonText,
  runProcess,
  type AdapterRequest,
  type AdapterResult,
  validateAdapterOutput,
} from './base';

export class PythonAdapter implements RuntimeAdapter {
  readonly backend = 'python';

  constructor(
    private readonly appRoot = path.resolve(process.cwd(), 'apps/quant/src')
  ) {}

  async execute<TOutput>(
    request: AdapterRequest<TOutput>
  ): Promise<AdapterResult<TOutput>> {
    const scriptPath = path.join(this.appRoot, `${request.model_id}.py`);
    const payload = JSON.stringify({ ...(request.metadata ?? {}) });
    const processResult = await runProcess(
      'python3',
      [scriptPath],
      payload,
      30_000
    );
    if (processResult.isErr()) {
      return err(processResult.error);
    }
    const { stdout, stderr, exitCode, timedOut, durationMs } =
      processResult.value;
    if (timedOut || exitCode !== 0) {
      return err({
        status: 'error',
        code: timedOut ? 'timeout_error' : 'exit_code_error',
        message: timedOut
          ? 'Python adapter timed out'
          : `Python script exited with ${exitCode}`,
        backend: this.backend,
        model_id: request.model_id,
        stderr,
        raw_text: stdout,
        exit_code: exitCode,
      });
    }
    const jsonResult = parseJsonText<TOutput>(
      stdout.trim(),
      this.backend,
      request.model_id,
      stderr
    );
    if (jsonResult.isErr()) {
      return err(jsonResult.error);
    }
    return validateAdapterOutput(
      request.schema,
      jsonResult.value,
      this.backend,
      request.model_id,
      stdout,
      stderr,
      durationMs
    );
  }

  async healthCheck(): Promise<BackendHealthStatus> {
    const scriptPath = path.join(this.appRoot, 'dcf.py');
    const payload = JSON.stringify({
      normalized_earnings: 400000000,
      growth_rates: [0.1, 0.1, 0.1],
      wacc: 0.09,
      terminal_growth: 0.025,
      shares_outstanding: 300000000,
    });
    const result = await runProcess('python3', [scriptPath], payload, 30_000);
    return {
      backend: this.backend,
      healthy: result.isOk() && result.value.exitCode === 0,
      reason: result.isOk() ? result.value.stdout.trim() : result.error.message,
      critical: true,
    };
  }
}
