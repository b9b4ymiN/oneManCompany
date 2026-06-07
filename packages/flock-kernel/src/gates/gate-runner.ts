/**
 * Flock Gate Runner
 *
 * Executes quality gates (tests, lint, typecheck, custom commands).
 * Runs gates sequentially and returns structured results.
 */

import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ok, err, type Result } from 'neverthrow';
import { eq, and } from 'drizzle-orm';
import type { FlockDatabase } from '../db/client';
import type { FlockConfig, GateResult, FlockError } from '../types';
import type { NewDbGate } from '../db/schema';
import { FlockError as FlockErrorClass } from '../types';

// ============================================================================
// Gate Configuration
// ============================================================================

/**
 * Configuration for a single gate.
 */
export interface GateConfig {
  /** Gate name/identifier */
  name: string;
  /** Command to execute */
  command: string;
  /** Whether gate is required (fails task if fails) */
  required?: boolean;
}

/**
 * Result of running a single gate.
 */
export interface GateRunResult {
  /** Gate name */
  gate: string;
  /** Execution status */
  status: 'passed' | 'failed' | 'skipped' | 'error';
  /** Process exit code */
  exitCode: number;
  /** Human-readable summary */
  summary: string;
  /** Path to detailed log output */
  logPath: string;
  /** Execution duration in milliseconds */
  duration_ms: number;
  /** Full output */
  output: string;
}

// ============================================================================
// Gate Runner
// ============================================================================

/**
 * Gate execution engine.
 *
 * Runs quality gates sequentially and captures results.
 */
export class GateRunner {
  private db: FlockDatabase;
  private config: FlockConfig;
  private readonly projectPath: string;

  constructor(db: FlockDatabase, config: FlockConfig, projectPath: string) {
    this.db = db;
    this.config = config;
    this.projectPath = projectPath;
  }

  /**
   * Run a single gate command.
   *
   * Executes the gate in the workspace, captures output,
   * and returns a structured result.
   */
  async runGate(
    workspacePath: string,
    gateConfig: GateConfig
  ): Promise<GateRunResult> {
    const startTime = Date.now();
    const logDir = join(workspacePath, '.flock', 'logs');
    await mkdir(logDir, { recursive: true });
    const logPath = join(logDir, `${gateConfig.name}.log`);

    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;

    try {
      // Parse command into executable and args
      const parts = gateConfig.command.split(' ');
      const command = parts[0] ?? '';
      const args = parts.slice(1);

      // Spawn the process
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, {
          cwd: workspacePath,
          stdio: 'pipe',
        } as SpawnOptionsWithoutStdio);

        let finished = false;

        if (child.stdout) {
          child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
          });
        }

        if (child.stderr) {
          child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
          });
        }

        child.on('error', (error: Error) => {
          if (finished) return;
          finished = true;
          stderr += error.message;
          reject(error);
        });

        child.on('close', (code: number | null) => {
          if (finished) {
            resolve();
            return;
          }
          finished = true;
          exitCode = code;
          resolve();
        });
      });
    } catch (error) {
      stderr += error instanceof Error ? error.message : 'Unknown error';
      exitCode = -1;
    }

    const duration_ms = Date.now() - startTime;
    const output = stdout + stderr;
    const status = exitCode === 0 ? 'passed' : 'failed';

    // Write output to log file
    await writeFile(logPath, output);

    // Generate summary
    const summary =
      exitCode === 0
        ? 'All checks passed'
        : `Gate failed with exit code ${exitCode}`;

    return {
      gate: gateConfig.name,
      status,
      exitCode: exitCode ?? -1,
      summary,
      logPath,
      duration_ms,
      output,
    };
  }

  /**
   * Run all gates sequentially.
   *
   * Executes gates in order:
   * 1. typecheck (if configured)
   * 2. test (if configured)
   * 3. lint (if configured)
   * 4. custom gates (in configured order)
   *
   * Short-circuits on first required gate failure.
   */
  async runAllGates(
    workspacePath: string,
    gates: GateConfig[]
  ): Promise<GateRunResult[]> {
    const results: GateRunResult[] = [];

    for (const gate of gates) {
      const result = await this.runGate(workspacePath, gate);
      results.push(result);

      // Short-circuit on required gate failure
      if (gate.required !== false && result.status === 'failed') {
        break;
      }
    }

    return results;
  }

  /**
   * Run gates for a task.
   *
   * High-level API that:
   * 1. Loads the task
   * 2. Gets the workspace
   * 3. Runs all configured gates
   * 4. Updates task state machine
   * 5. Persists gate results to DB
   */
  async runGatesForTask(
    taskId: string,
    workspacePath: string
  ): Promise<Result<GateRunResult[], FlockError>> {
    // Load task
    const task = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.id, taskId))
      .get();

    if (!task) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Task not found: ${taskId}`, {
          taskId,
        })
      );
    }

    // Build gate configs from FlockConfig
    const gateConfigs: GateConfig[] = Object.entries(this.config.gates).map(
      ([name, config]) => ({
        name,
        command: config.command,
        required: true,
      })
    );

    // Run all gates
    const results = await this.runAllGates(workspacePath, gateConfigs);

    // Persist gate results to DB
    for (const result of results) {
      const newGate: NewDbGate = {
        id: randomUUID(),
        task_id: taskId,
        name: result.gate,
        command: this.config.gates[result.gate]?.command ?? '',
        status: result.status === 'passed' ? 'passed' : 'failed',
        output_path: result.logPath,
        created_at: new Date().toISOString(),
      };

      await this.db.db.insert(this.db.schema.gates).values(newGate);
    }

    // Check if all required gates passed
    const allPassed = results.every((r) => r.status === 'passed' || r.status === 'skipped');

    // Update task state
    if (allPassed) {
      await this.db.db
        .update(this.db.schema.tasks)
        .set({ status: 'REVIEW_REQUIRED', updated_at: new Date().toISOString() })
        .where(eq(this.db.schema.tasks.id, taskId));
    } else {
      await this.db.db
        .update(this.db.schema.tasks)
        .set({ status: 'GATES_FAILED', updated_at: new Date().toISOString() })
        .where(eq(this.db.schema.tasks.id, taskId));
    }

    return ok(results);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a gate runner.
 */
export function createGateRunner(
  db: FlockDatabase,
  config: FlockConfig,
  projectPath: string
): GateRunner {
  return new GateRunner(db, config, projectPath);
}
