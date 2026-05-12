import { err } from 'neverthrow';
import type { BackendHealthStatus, RuntimeAdapter } from './base';
import {
  parseJsonText,
  runProcess,
  type AdapterFailure,
  type AdapterRequest,
  type AdapterResult,
  validateAdapterOutput,
} from './base';

const allowedClaudeModels = new Set([
  'claude-opus',
  'claude-opus-4-5',
  'claude-sonnet',
]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ClaudeAdapter implements RuntimeAdapter {
  readonly backend = 'claude';

  async execute<TOutput>(
    request: AdapterRequest<TOutput>
  ): Promise<AdapterResult<TOutput>> {
    if (!allowedClaudeModels.has(request.model_id)) {
      return err({
        status: 'error',
        code: 'schema_error',
        message: `Unsupported Claude model: ${request.model_id}`,
        backend: this.backend,
        model_id: request.model_id,
        stderr: '',
      });
    }
    const processResult = await runProcess(
      'claude',
      ['--print', request.prompt],
      undefined,
      request.timeout_ms
    );
    if (processResult.isOk()) {
      const { stdout, stderr, exitCode, timedOut, durationMs } =
        processResult.value;
      if (!timedOut && exitCode === 0) {
        const json = parseJsonText<TOutput>(
          stdout.trim(),
          this.backend,
          request.model_id,
          stderr
        );
        if (json.isOk()) {
          return validateAdapterOutput(
            request.schema,
            json.value,
            this.backend,
            request.model_id,
            stdout,
            stderr,
            durationMs
          );
        }
      }
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return err({
        status: 'error',
        code: 'auth_error',
        message: 'ANTHROPIC_API_KEY not configured and CLI path unavailable',
        backend: this.backend,
        model_id: request.model_id,
        stderr: processResult.isOk()
          ? processResult.value.stderr
          : processResult.error.stderr,
      });
    }

    const body = {
      model: request.model_id,
      max_tokens: 4000,
      messages: [{ role: 'user', content: request.prompt }],
    };
    let lastFailure: AdapterFailure | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if ([429, 503].includes(response.status) && attempt < 2) {
        await delay(2 ** attempt * 1000);
        continue;
      }
      const text = await response.text();
      if (!response.ok) {
        lastFailure = {
          status: 'error',
          code: response.status === 401 ? 'auth_error' : 'http_error',
          message: `Claude HTTP error ${response.status}`,
          backend: this.backend,
          model_id: request.model_id,
          stderr: `Claude HTTP error payload suppressed (${response.status})`,
        };
        continue;
      }
      const payloadResult = parseJsonText<{
        content?: Array<{ text?: string }>;
      }>(text, this.backend, request.model_id, '');
      if (payloadResult.isErr()) {
        return err(payloadResult.error);
      }
      const rawText = payloadResult.value.content?.[0]?.text?.trim() ?? '';
      const jsonResult = parseJsonText<TOutput>(
        rawText,
        this.backend,
        request.model_id,
        ''
      );
      if (jsonResult.isErr()) {
        return err(jsonResult.error);
      }
      return validateAdapterOutput(
        request.schema,
        jsonResult.value,
        this.backend,
        request.model_id,
        rawText,
        '',
        0
      );
    }
    return err(
      lastFailure ?? {
        status: 'error',
        code: 'http_error',
        message: 'Claude request failed',
        backend: this.backend,
        model_id: request.model_id,
        stderr: '',
      }
    );
  }

  async healthCheck(): Promise<BackendHealthStatus> {
    const cli = await runProcess(
      'claude',
      ['--print', '{"status":"ok"}'],
      undefined,
      10_000
    );
    if (cli.isOk() && cli.value.exitCode === 0) {
      return {
        backend: this.backend,
        healthy: true,
        reason: 'Claude CLI available',
        critical: false,
      };
    }
    return {
      backend: this.backend,
      healthy: Boolean(process.env.ANTHROPIC_API_KEY),
      reason: process.env.ANTHROPIC_API_KEY
        ? 'API key available'
        : 'Claude CLI/API key unavailable',
      critical: false,
    };
  }
}
