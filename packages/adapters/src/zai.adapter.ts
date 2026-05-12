import { err } from 'neverthrow';
import type { BackendHealthStatus, RuntimeAdapter } from './base';
import {
  parseJsonText,
  type AdapterRequest,
  type AdapterResult,
  validateAdapterOutput,
} from './base';

export class ZAIAdapter implements RuntimeAdapter {
  readonly backend = 'zai';

  async execute<TOutput>(
    request: AdapterRequest<TOutput>
  ): Promise<AdapterResult<TOutput>> {
    const endpoint = process.env.ZAI_API_URL;
    const token = process.env.ZAI_API_KEY;
    if (!endpoint || !token) {
      return err({
        status: 'error',
        code: 'auth_error',
        message: 'ZAI_API_URL or ZAI_API_KEY missing',
        backend: this.backend,
        model_id: request.model_id,
        stderr: '',
      });
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ model: request.model_id, prompt: request.prompt }),
    });
    const text = await response.text();
    if (!response.ok) {
      return err({
        status: 'error',
        code: response.status === 401 ? 'auth_error' : 'http_error',
        message: `ZAI HTTP error ${response.status}`,
        backend: this.backend,
        model_id: request.model_id,
        stderr: text,
      });
    }
    const jsonResult = parseJsonText<TOutput>(
      text.trim(),
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
      text,
      '',
      0
    );
  }

  async healthCheck(): Promise<BackendHealthStatus> {
    return {
      backend: this.backend,
      healthy: Boolean(process.env.ZAI_API_URL && process.env.ZAI_API_KEY),
      reason:
        process.env.ZAI_API_URL && process.env.ZAI_API_KEY
          ? 'ZAI env configured'
          : 'ZAI env missing',
      critical: false,
    };
  }
}
