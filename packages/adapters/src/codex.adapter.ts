import { err } from 'neverthrow';
import type { BackendHealthStatus, RuntimeAdapter } from './base';
import {
  parseJsonText,
  runProcess,
  type AdapterRequest,
  type AdapterResult,
  validateAdapterOutput,
} from './base';

export class CodexAdapter implements RuntimeAdapter {
  readonly backend = 'codex';

  async execute<TOutput>(
    request: AdapterRequest<TOutput>
  ): Promise<AdapterResult<TOutput>> {
    const processResult = await runProcess(
      'codex',
      ['exec', '--json', request.prompt],
      undefined,
      request.timeout_ms
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
          ? 'Codex CLI timed out'
          : `Codex CLI exited with ${exitCode}`,
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
    const result = await runProcess('codex', ['--help'], undefined, 10_000);
    return {
      backend: this.backend,
      healthy: result.isOk() && result.value.exitCode === 0,
      reason: result.isOk() ? 'Codex CLI available' : result.error.message,
      critical: false,
    };
  }
}
