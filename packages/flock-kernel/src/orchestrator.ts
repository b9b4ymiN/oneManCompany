/**
 * Flock Task Orchestrator
 *
 * Central coordination layer for the Flock system.
 * Orchestrates workspace creation, agent spawning, gate execution,
 * state transitions, and task lifecycle management.
 */

import { randomUUID } from 'node:crypto';
import { ok, err, type Result } from 'neverthrow';
import { eq, and, desc } from 'drizzle-orm';
import type {
  Task,
  Run,
  Review,
  FlockError,
  FlockConfig,
  GateResult,
} from './types';
import type { GateRunResult } from './gates';
import { FlockError as FlockErrorClass } from './types';
import type { FlockDatabase, DbTask, DbRun } from './db/client';
import type { NewDbTask, NewDbRun, NewDbReview } from './db/schema';
import { createAgentSpawner, type AgentSpawner } from './agents';
import { createGateRunner, type GateRunner } from './gates';
import { createWorkspace, cleanupWorkspace } from './workspace';
import { collectDiff, type DiffSummary } from './workspace';
import { auditLog } from './observability/audit';

/**
 * Configuration for starting a run.
 */
export interface StartRunConfig {
  /** Timeout in milliseconds */
  timeout_ms?: number;
}

/**
 * Flock Task Orchestrator
 *
 * Central coordination for:
 * - Task creation and management
 * - Run lifecycle (spawn, monitor, collect results)
 * - Gate execution
 * - Reviews and approvals
 * - Merging changes
 */
export class FlockOrchestrator {
  private db: FlockDatabase;
  private config: FlockConfig;
  private spawner: AgentSpawner;
  private gateRunner: GateRunner;

  constructor(db: FlockDatabase, config: FlockConfig) {
    this.db = db;
    this.config = config;
    this.spawner = createAgentSpawner({ db, config });
    // Get the project path from the first project (for gate runner)
    // In practice, this should be passed per-task
    const projectPath = process.cwd();
    this.gateRunner = createGateRunner(db, config, projectPath);
  }

  /**
   * Create a new task.
   *
   * Process:
   * 1. Validate project exists
   * 2. Generate task ID (auto-increment like task-001)
   * 3. Create task in DRAFT state
   * 4. Return task
   */
  async createTask(
    projectId: string,
    title: string,
    options: {
      description?: string;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      requiresReview?: boolean;
    } = {}
  ): Promise<Result<Task, FlockError>> {
    // Validate project exists
    const project = await this.db.db
      .select()
      .from(this.db.schema.projects)
      .where(eq(this.db.schema.projects.id, projectId))
      .get();

    if (!project) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Project not found: ${projectId}`, {
          projectId,
        })
      );
    }

    // Count existing tasks for this project to generate ID
    const taskCount = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.project_id, projectId))
      .all().length;

    const taskId = `task-${String(taskCount + 1).padStart(3, '0')}`;
    const now = new Date().toISOString();

    // Create task
    const newTask: NewDbTask = {
      id: taskId,
      project_id: projectId,
      title,
      description: options.description || '',
      status: 'DRAFT',
      priority: options.priority || 'medium',
      requires_review: options.requiresReview ?? true,
      created_at: now,
      updated_at: now,
    };

    await this.db.db.insert(this.db.schema.tasks).values(newTask);

    // Convert to domain type
    const task: Task = {
      id: newTask.id,
      project_id: newTask.project_id,
      title: newTask.title,
      description: newTask.description,
      status: newTask.status as Task['status'],
      priority: newTask.priority as Task['priority'],
      requires_review: newTask.requires_review ?? true,
      created_at: newTask.created_at,
      updated_at: newTask.updated_at,
    };

    auditLog('task_created', 'system', taskId, {
      projectId,
      title,
      priority: task.priority,
    });

    return ok(task);
  }

  /**
   * Start a run for a task.
   *
   * Process:
   * 1. Load task and validate state
   * 2. Load project to get repo path
   * 3. Create workspace via workspace manager
   * 4. Spawn agent with task description as prompt
   * 5. Transition task state: READY → RUNNING
   * 6. Return run record
   */
  async startRun(
    taskId: string,
    agentId: string,
    config: StartRunConfig = {}
  ): Promise<Result<Run, FlockError>> {
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

    // Validate task state (must be READY or DRAFT)
    if (task.status !== 'READY' && task.status !== 'DRAFT') {
      return err(
        new FlockErrorClass(
          'DATABASE_ERROR',
          `Task is not ready to run. Current state: ${task.status}`,
          { taskId, currentState: task.status }
        )
      );
    }

    // Load project
    const project = await this.db.db
      .select()
      .from(this.db.schema.projects)
      .where(eq(this.db.schema.projects.id, task.project_id))
      .get();

    if (!project) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Project not found: ${task.project_id}`, {
          projectId: task.project_id,
        })
      );
    }

    // Create workspace
    const workspaceResult = await createWorkspace(project.repo_path, taskId, agentId);
    if (workspaceResult.isErr()) {
      return err(workspaceResult.error);
    }

    const workspacePath = workspaceResult.value.path;

    // Generate branch name
    const branchName = `flock/${taskId}/${agentId}`;

    // Build prompt for agent
    const prompt = this.buildAgentPrompt(task);

    // Spawn agent
    const spawnResult = await this.spawner.spawnAgent(
      taskId,
      agentId,
      prompt,
      branchName
    );

    if (spawnResult.isErr()) {
      // Cleanup workspace on failure
      await cleanupWorkspace(project.repo_path, taskId, agentId, false);
      return err(spawnResult.error);
    }

    const run = spawnResult.value;

    // Update task state to RUNNING
    await this.db.db
      .update(this.db.schema.tasks)
      .set({ status: 'RUNNING', updated_at: new Date().toISOString() })
      .where(eq(this.db.schema.tasks.id, taskId));

    auditLog('run_started', agentId, run.id, {
      taskId,
      agentId,
      workspacePath,
      branchName,
    });

    return ok(run);
  }

  /**
   * Stop a running run.
   */
  async stopRun(runId: string): Promise<Result<void, FlockError>> {
    const result = await this.spawner.stopAgent(runId);

    if (result.isErr()) {
      return err(result.error);
    }

    auditLog('run_stopped', 'system', runId, {});

    return ok(undefined);
  }

  /**
   * Run gates for a task.
   *
   * Process:
   * 1. Load task and workspace
   * 2. Execute all configured gates
   * 3. Update task state based on results
   * 4. Return gate results
   */
  async runGates(taskId: string, workspacePath: string): Promise<Result<GateRunResult[], FlockError>> {
    const result = await this.gateRunner.runGatesForTask(taskId, workspacePath);

    if (result.isErr()) {
      return err(result.error);
    }

    auditLog('gates_run', 'system', taskId, {
      gateCount: result.value.length,
      passed: result.value.filter((g) => g.status === 'passed').length,
      failed: result.value.filter((g) => g.status === 'failed').length,
    });

    return result;
  }

  /**
   * Approve a task.
   *
   * Process:
   * 1. Validate task state
   * 2. Create review record
   * 3. Update task state to APPROVED
   * 4. Return updated task
   */
  async approveTask(taskId: string, reviewer: string): Promise<Result<Task, FlockError>> {
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

    // Validate state (must be REVIEW_REQUIRED or GATES_FAILED with retry)
    if (task.status !== 'REVIEW_REQUIRED' && task.status !== 'GATES_FAILED') {
      return err(
        new FlockErrorClass(
          'DATABASE_ERROR',
          `Task is not ready for approval. Current state: ${task.status}`,
          { taskId, currentState: task.status }
        )
      );
    }

    // Create review
    const reviewId = randomUUID();
    const now = new Date().toISOString();

    const newReview: NewDbReview = {
      id: reviewId,
      task_id: taskId,
      reviewer,
      verdict: 'APPROVE',
      comment: 'Approved via CLI',
      created_at: now,
    };

    await this.db.db.insert(this.db.schema.reviews).values(newReview);

    // Update task state to APPROVED
    await this.db.db
      .update(this.db.schema.tasks)
      .set({ status: 'APPROVED', updated_at: now })
      .where(eq(this.db.schema.tasks.id, taskId));

    // Return updated task
    const updatedTask = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.id, taskId))
      .get();

    if (!updatedTask) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Failed to retrieve updated task: ${taskId}`, {
          taskId,
        })
      );
    }

    auditLog('task_approved', reviewer, taskId, {
      reviewId,
    });

    return ok({
      id: updatedTask.id,
      project_id: updatedTask.project_id,
      title: updatedTask.title,
      description: updatedTask.description,
      status: updatedTask.status as Task['status'],
      priority: updatedTask.priority as Task['priority'],
      requires_review: updatedTask.requires_review,
      created_at: updatedTask.created_at,
      updated_at: updatedTask.updated_at,
    });
  }

  /**
   * Record a review for a task.
   *
   * Similar to approveTask but supports all verdicts.
   */
  async recordReview(
    taskId: string,
    reviewer: string,
    verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'ASK_ANOTHER_AGENT' | 'REJECT',
    comment: string
  ): Promise<Result<Review, FlockError>> {
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

    // Create review
    const reviewId = randomUUID();
    const now = new Date().toISOString();

    const newReview: NewDbReview = {
      id: reviewId,
      task_id: taskId,
      reviewer,
      verdict,
      comment,
      created_at: now,
    };

    await this.db.db.insert(this.db.schema.reviews).values(newReview);

    // Update task state based on verdict
    let newStatus: DbTask['status'] = task.status;
    if (verdict === 'APPROVE') {
      newStatus = 'APPROVED';
    } else if (verdict === 'REJECT') {
      newStatus = 'REJECTED';
    } else if (verdict === 'REQUEST_CHANGES') {
      newStatus = 'READY'; // Can retry
    }

    if (newStatus !== task.status) {
      await this.db.db
        .update(this.db.schema.tasks)
        .set({ status: newStatus, updated_at: now })
        .where(eq(this.db.schema.tasks.id, taskId));
    }

    auditLog('review_recorded', reviewer, taskId, {
      reviewId,
      verdict,
    });

    // Return review record
    const review = await this.db.db
      .select()
      .from(this.db.schema.reviews)
      .where(eq(this.db.schema.reviews.id, reviewId))
      .get();

    if (!review) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Failed to retrieve review: ${reviewId}`, {
          reviewId,
        })
      );
    }

    return ok({
      id: review.id,
      task_id: review.task_id,
      reviewer: review.reviewer,
      verdict: review.verdict as Review['verdict'],
      comment: review.comment,
      created_at: review.created_at,
    });
  }

  /**
   * Reject a task.
   *
   * Process:
   * 1. Validate task state
   * 2. Create review record with REJECT verdict
   * 3. Update task state to REJECTED
   * 4. Return updated task
   */
  async rejectTask(taskId: string, reason: string): Promise<Result<Task, FlockError>> {
    // Use recordReview with REJECT verdict
    const result = await this.recordReview(taskId, 'cli-user', 'REJECT', reason);

    if (result.isErr()) {
      return err(result.error);
    }

    // Get updated task
    const updatedTask = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.id, taskId))
      .get();

    if (!updatedTask) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Failed to retrieve updated task: ${taskId}`, {
          taskId,
        })
      );
    }

    return ok({
      id: updatedTask.id,
      project_id: updatedTask.project_id,
      title: updatedTask.title,
      description: updatedTask.description,
      status: updatedTask.status as Task['status'],
      priority: updatedTask.priority as Task['priority'],
      requires_review: updatedTask.requires_review,
      created_at: updatedTask.created_at,
      updated_at: updatedTask.updated_at,
    });
  }

  /**
   * Merge a task's changes.
   *
   * Process:
   * 1. Validate task is APPROVED
   * 2. Get the run to find workspace and branch
   * 3. Merge branch into default branch
   * 4. Update task state to MERGED
   * 5. Cleanup workspace (unless preserve)
   * 6. Return updated task
   */
  async mergeTask(taskId: string, preserve = false): Promise<Result<Task, FlockError>> {
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

    // Validate state
    if (task.status !== 'APPROVED') {
      return err(
        new FlockErrorClass(
          'DATABASE_ERROR',
          `Task is not approved. Current state: ${task.status}`,
          { taskId, currentState: task.status }
        )
      );
    }

    // Load project
    const project = await this.db.db
      .select()
      .from(this.db.schema.projects)
      .where(eq(this.db.schema.projects.id, task.project_id))
      .get();

    if (!project) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Project not found: ${task.project_id}`, {
          projectId: task.project_id,
        })
      );
    }

    // Get the most recent run
    const run = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(eq(this.db.schema.runs.task_id, taskId))
      .orderBy(desc(this.db.schema.runs.started_at))
      .limit(1)
      .get();

    if (!run) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `No run found for task: ${taskId}`, {
          taskId,
        })
      );
    }

    // Merge the branch using git
    try {
      const { execSync } = require('node:child_process');

      // Checkout default branch
      execSync(`git checkout ${project.default_branch}`, {
        cwd: project.repo_path,
        stdio: 'inherit',
      });

      // Merge the task branch
      execSync(`git merge ${run.branch_name} --no-ff`, {
        cwd: project.repo_path,
        stdio: 'inherit',
      });

      auditLog('task_merged', 'system', taskId, {
        runId: run.id,
        branchName: run.branch_name,
        preserve,
      });
    } catch (error) {
      return err(
        new FlockErrorClass(
          'GIT_COMMAND_FAILED',
          `Failed to merge branch: ${error instanceof Error ? error.message : String(error)}`,
          { taskId, branchName: run.branch_name }
        )
      );
    }

    // Update task state to MERGED
    const now = new Date().toISOString();
    await this.db.db
      .update(this.db.schema.tasks)
      .set({ status: 'MERGED', updated_at: now })
      .where(eq(this.db.schema.tasks.id, taskId));

    // Cleanup workspace
    const cleanupResult = await cleanupWorkspace(
      project.repo_path,
      taskId,
      run.agent_id,
      preserve
    );

    if (cleanupResult.isErr()) {
      // Log but don't fail
      console.error(`Failed to cleanup workspace: ${cleanupResult.error.message}`);
    }

    // Return updated task
    const updatedTask = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.id, taskId))
      .get();

    if (!updatedTask) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Failed to retrieve updated task: ${taskId}`, {
          taskId,
        })
      );
    }

    return ok({
      id: updatedTask.id,
      project_id: updatedTask.project_id,
      title: updatedTask.title,
      description: updatedTask.description,
      status: updatedTask.status as Task['status'],
      priority: updatedTask.priority as Task['priority'],
      requires_review: updatedTask.requires_review,
      created_at: updatedTask.created_at,
      updated_at: updatedTask.updated_at,
    });
  }

  /**
   * Build the agent prompt for a task.
   */
  private buildAgentPrompt(task: DbTask): string {
    const parts = [
      `Task: ${task.title}`,
      task.description ? `Description: ${task.description}` : '',
      `Priority: ${task.priority}`,
      '',
      'Please complete this task by making the necessary changes to the codebase.',
      'When you are done, provide a summary of the changes you made.',
    ];

    return parts.filter(Boolean).join('\n');
  }
}

/**
 * Factory function to create an orchestrator.
 */
export function createOrchestrator(db: FlockDatabase, config: FlockConfig): FlockOrchestrator {
  return new FlockOrchestrator(db, config);
}
