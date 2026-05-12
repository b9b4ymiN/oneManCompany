import { err } from 'neverthrow';
import type { BackendHealthStatus, RuntimeAdapter } from './base';
import {
  parseJsonText,
  runProcess,
  type AdapterRequest,
  type AdapterResult,
  validateAdapterOutput,
} from './base';

export class GeminiAdapter implements RuntimeAdapter {
  readonly backend = 'gemini-cli';

  async execute<TOutput>(
    request: AdapterRequest<TOutput>
  ): Promise<AdapterResult<TOutput>> {
    const processResult = await runProcess(
      'gemini',
      ['-p', request.prompt],
      undefined,
      request.timeout_ms
    );
    if (processResult.isErr()) {
      return err(processResult.error);
    }
    const { stdout, stderr, exitCode, timedOut, durationMs } =
      processResult.value;
    if (timedOut) {
      return err({
        status: 'error',
        code: 'timeout_error',
        message: 'Gemini CLI timed out',
        backend: this.backend,
        model_id: request.model_id,
        stderr,
        raw_text: stdout,
        exit_code: exitCode,
      });
    }
    if (exitCode !== 0) {
      return err({
        status: 'error',
        code: stderr.includes('quota') ? 'auth_error' : 'exit_code_error',
        message: `Gemini CLI exited with code ${exitCode}`,
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
    const processResult = await runProcess(
      'gemini',
      [
        '-p',
        'respond with JSON exactly: {"status":"ok","model":"gemini-2-flash"}',
      ],
      undefined,
      30_000
    );
    if (processResult.isErr()) {
      return {
        backend: this.backend,
        healthy: false,
        reason: processResult.error.message,
        critical: true,
      };
    }
    const { stdout, exitCode, stderr } = processResult.value;
    const json = parseJsonText<{ status: string; model: string }>(
      stdout.trim(),
      this.backend,
      'gemini-2-flash',
      stderr
    );
    const healthy = exitCode === 0 && json.isOk() && json.value.status === 'ok';
    return {
      backend: this.backend,
      healthy,
      reason: healthy ? stdout.trim() : stderr || 'Gemini self-test failed',
      critical: true,
    };
  }
}
