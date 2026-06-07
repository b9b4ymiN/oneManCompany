/**
 * Flock CLI Agent Adapter
 *
 * Spawns CLI-based agents in isolated worktrees.
 * Streams stdout/stderr as events and manages process lifecycle.
 */

import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentConfig } from '../types';
import type {
  AgentAdapter,
  AgentRunInput,
  AgentEvent,
  AgentRunResult,
} from './adapter';

// ============================================================================
// CLI Agent Adapter
// ============================================================================

/**
 * CLI-based agent adapter implementation.
 *
 * Spawns agent commands in isolated workspace directories,
 * captures stdout/stderr as events, and manages process lifecycle.
 */
export class CLIAgentAdapter implements AgentAdapter {
  readonly id: string;
  readonly config: AgentConfig;
  private activeProcesses = new Map<string, import('node:child_process').ChildProcess>();

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.config = config;
  }

  /**
   * Spawn the agent and stream events.
   *
   * Process:
   * 1. Set up log file for events
   * 2. Spawn agent command in workspace
   * 3. Stream stdout/stderr as events
   * 4. Handle timeout via AbortController
   * 5. Log all events to .flock/logs/{runId}.jsonl
   */
  async *spawn(input: AgentRunInput): AsyncIterable<AgentEvent> {
    const { taskId, runId, workspacePath, branch, prompt, timeout_ms } = input;
    const startTime = Date.now();

    // Set up log directory and file
    const logDir = join(workspacePath, '.flock', 'logs');
    await mkdir(logDir, { recursive: true });
    const logPath = join(logDir, `${runId}.jsonl`);

    const logEvent = async (event: AgentEvent) => {
      const line = JSON.stringify(event) + '\n';
      await writeFile(logPath, line, { flag: 'a' });
    };

    // Prepare environment variables
    const env: Record<string, string | undefined> = { ...process.env };
    if (this.config.mode === 'readonly') {
      env.FLOCK_READONLY = '1';
    }
    env.FLOCK_TASK_ID = taskId;
    env.FLOCK_RUN_ID = runId;
    env.FLOCK_BRANCH = branch;

    // Prepare spawn options
    const gitDir = join(workspacePath, '.git');
    const spawnEnv: NodeJS.ProcessEnv = {
      ...env,
      GIT_WORK_TREE: workspacePath,
      GIT_DIR: gitDir,
      NODE_ENV: env.NODE_ENV || process.env.NODE_ENV || 'development',
    } as NodeJS.ProcessEnv;

    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd: workspacePath,
      env: spawnEnv,
      stdio: 'pipe',
    };

    // Spawn the agent process
    const child = spawn(this.config.command, this.config.args, spawnOptions);
    this.activeProcesses.set(runId, child);

    yield this.createEvent('agent_spawned', `Process spawned with PID ${child.pid}`);

    // Set up timeout
    let timeoutHandle: NodeJS.Timeout | undefined;
    if (timeout_ms > 0) {
      timeoutHandle = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5000);
        }
      }, timeout_ms);
    }

    // Track completion
    let finished = false;
    let stdout = '';
    let stderr = '';

    // Stream stdout events
    child.stdout?.on('data', async (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      const event = this.createEvent('stdout', text);
      await logEvent(event);
    });

    // Stream stderr events
    child.stderr?.on('data', async (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      const event = this.createEvent('stderr', text);
      await logEvent(event);
    });

    // Handle process errors
    child.on('error', async (error) => {
      if (finished) return;
      finished = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const event = this.createEvent('error', error.message);
      await logEvent(event);
    });

    // Handle process exit
    await new Promise<void>((resolve) => {
      child.on('close', async (code, signal) => {
        if (finished) {
          resolve();
          return;
        }
        finished = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);

        const duration_ms = Date.now() - startTime;
        const timedOut = signal === 'SIGKILL' && duration_ms >= timeout_ms;

        const exitMessage = signal
          ? `Process terminated by signal ${signal}`
          : `Process exited with code ${code}`;

        const event = this.createEvent(
          'exit',
          JSON.stringify({
            exitCode: code,
            signal,
            duration_ms,
            timedOut,
          })
        );
        await logEvent(event);

        resolve();
      });
    });

    // Clean up
    this.activeProcesses.delete(runId);
  }

  /**
   * Stop a running agent.
   *
   * First attempts SIGTERM for graceful shutdown.
   * If process doesn't exit within 5 seconds, sends SIGKILL.
   */
  async stop(runId: string): Promise<void> {
    const child = this.activeProcesses.get(runId);
    if (!child) {
      return; // Already stopped or never started
    }

    if (child.killed) {
      this.activeProcesses.delete(runId);
      return;
    }

    // Try graceful shutdown first
    child.kill('SIGTERM');

    // Force kill after 5 seconds
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      child.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.activeProcesses.delete(runId);
  }

  /**
   * Create an agent event with timestamp.
   */
  private createEvent(type: AgentEvent['type'], data: string): AgentEvent {
    return {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a CLI agent adapter from configuration.
 */
export function createCLIAgentAdapter(config: AgentConfig): CLIAgentAdapter {
  return new CLIAgentAdapter(config);
}
