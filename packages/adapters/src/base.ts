import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { AgentId } from '@onemancompany/kernel';

export const AdapterErrorCodeSchema = z.enum([
  'spawn_error',
  'exit_code_error',
  'timeout_error',
  'schema_error',
  'auth_error',
  'http_error',
  'unhealthy_backend',
  'parse_error',
]);
export type AdapterErrorCode = z.infer<typeof AdapterErrorCodeSchema>;

export interface AdapterRequest<TOutput> {
  mission_id: string;
  agent_id: AgentId;
  model_id: string;
  prompt: string;
  schema: z.ZodType<TOutput>;
  timeout_ms: number;
  metadata?: Record<string, unknown>;
}

export interface AdapterSuccess<TOutput> {
  status: 'success';
  output: TOutput;
  raw_text: string;
  stderr: string;
  backend: string;
  model_id: string;
  duration_ms: number;
}

export interface AdapterFailure {
  status: 'error';
  code: AdapterErrorCode;
  message: string;
  backend: string;
  model_id: string;
  stderr: string;
  raw_text?: string;
  exit_code?: number | null;
}

export type AdapterResult<TOutput> = Result<
  AdapterSuccess<TOutput>,
  AdapterFailure
>;

export interface BackendHealthStatus {
  backend: string;
  healthy: boolean;
  reason: string;
  critical: boolean;
}

export interface HealthReport {
  generated_at: string;
  backends: BackendHealthStatus[];
}

export interface AdapterExecutionTrace {
  adapter: string;
  model_id: string;
  attempt: number;
  outcome: 'success' | 'failure' | 'skipped';
  message: string;
}

export interface RuntimeAdapter {
  readonly backend: string;
  execute<TOutput>(
    request: AdapterRequest<TOutput>
  ): Promise<AdapterResult<TOutput>>;
  healthCheck?(): Promise<BackendHealthStatus>;
}

export interface ProcessExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

export function validateAdapterOutput<TOutput>(
  schema: z.ZodType<TOutput>,
  payload: unknown,
  backend: string,
  modelId: string,
  rawText: string,
  stderr: string,
  durationMs: number
): AdapterResult<TOutput> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return err({
      status: 'error',
      code: 'schema_error',
      message: parsed.error.message,
      backend,
      model_id: modelId,
      stderr,
      raw_text: rawText,
    });
  }
  return ok({
    status: 'success',
    output: parsed.data,
    raw_text: rawText,
    stderr,
    backend,
    model_id: modelId,
    duration_ms: durationMs,
  });
}

export async function runProcess(
  command: string,
  args: string[],
  stdinText: string | undefined,
  timeoutMs: number,
  options: SpawnOptionsWithoutStdio = {}
): Promise<Result<ProcessExecutionResult, AdapterFailure>> {
  const startedAt = Date.now();
  return await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    const child = spawn(command, args, {
      ...options,
      stdio: 'pipe',
    });
    const timeout = setTimeout(() => {
      if (!finished) {
        child.kill('SIGKILL');
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      finished = true;
      resolve(
        err({
          status: 'error',
          code: 'spawn_error',
          message: error.message,
          backend: command,
          model_id: args.join(' '),
          stderr,
        })
      );
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (finished) {
        return;
      }
      finished = true;
      const durationMs = Date.now() - startedAt;
      resolve(
        ok({
          stdout,
          stderr,
          exitCode: code,
          timedOut: signal === 'SIGKILL' && durationMs >= timeoutMs,
          durationMs,
        })
      );
    });

    if (stdinText !== undefined) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();
  });
}


function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch && fenceMatch[1] ? fenceMatch[1].trim() : trimmed;
}

function extractFirstJsonCandidate(text: string): string {
  const stripped = stripCodeFences(text);
  const startObject = stripped.indexOf('{');
  const startArray = stripped.indexOf('[');
  let start = -1;
  if (startObject >= 0 && startArray >= 0) start = Math.min(startObject, startArray);
  else start = Math.max(startObject, startArray);
  if (start < 0) return stripped;
  const first = stripped[start];
  const close = first === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === first) depth += 1;
    if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        return stripped.slice(start, i + 1).trim();
      }
    }
  }
  return stripped;
}

export function parseJsonText<T>(
  text: string,
  backend: string,
  modelId: string,
  stderr: string
): Result<T, AdapterFailure> {
  try {
    return ok(JSON.parse(extractFirstJsonCandidate(text)) as T);
  } catch (error) {
    return err({
      status: 'error',
      code: 'parse_error',
      message: error instanceof Error ? error.message : 'Failed to parse JSON',
      backend,
      model_id: modelId,
      stderr,
      raw_text: text,
    });
  }
}
