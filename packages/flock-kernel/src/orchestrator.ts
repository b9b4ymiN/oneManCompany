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
import { createDependencyResolver, type DependencyResolver } from './dag';
import { createParallelScheduler, type ParallelScheduler } from './scheduler';
import { createRetryEngine, type RetryEngine } from './retry';
import { createReviewerEngine, type ReviewerEngine } from './reviewer';
import { createEventLogger, type FlockEventLogger } from './observability/event-log';
import { createWorkflowRunner, type WorkflowRunner } from './workflows';
import type { SequentialChain, ParallelFanOut, FanIn, ReviewPipeline } from './workflows';
import type { RetryPolicy, ReviewerConfig, ConsensusResult, ReviewerAssignment } from './types';

/**
 * Configuration for starting a run.
 */
export interface StartRunConfig {
  /** Timeout in milliseconds */
  timeout_ms?: number;
  /** If true, queue the run when parallel limit is reached */
  queueEnabled?: boolean;
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
  private dependencyResolver: DependencyResolver;
  private scheduler: ParallelScheduler;
  private retryEngine: RetryEngine;
  private reviewerEngine: ReviewerEngine;
  private eventLogger: FlockEventLogger;
  private workflowRunner: WorkflowRunner;

  constructor(db: FlockDatabase, config: FlockConfig) {
    this.db = db;
    this.config = config;
    this.spawner = createAgentSpawner({ db, config });
    // Get the project path from the first project (for gate runner)
    // In practice, this should be passed per-task
    const projectPath = process.cwd();
    this.gateRunner = createGateRunner(db, config, projectPath);
    this.dependencyResolver = createDependencyResolver(db);
    this.scheduler = createParallelScheduler(db, {
      maxParallelRuns: config.policies.max_parallel_runs,
    });
    this.eventLogger = createEventLogger(db, projectPath);
    this.retryEngine = createRetryEngine(db, this.eventLogger);
    this.reviewerEngine = createReviewerEngine(db, this.eventLogger);
    this.workflowRunner = createWorkflowRunner(db);
  }

  /**
   * Create a new task.
   *
   * Process:
   * 1. Validate project exists
   * 2. Generate task ID (auto-increment like task-001)
   * 3. Create task in DRAFT state
   * 4. Add dependencies if provided
   * 5. Return task
   */
  async createTask(
    projectId: string,
    title: string,
    options: {
      description?: string;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      requiresReview?: boolean;
      dependsOn?: string[];
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

    // Add dependencies if provided
    if (options.dependsOn && options.dependsOn.length > 0) {
      for (const depId of options.dependsOn) {
        const addResult = await this.dependencyResolver.addDependency(taskId, depId);
        if (addResult.isErr()) {
          // Rollback task creation on dependency failure
          await this.db.db
            .delete(this.db.schema.tasks)
            .where(eq(this.db.schema.tasks.id, taskId));
          return err(addResult.error);
        }
      }
    }

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
      dependsOn: options.dependsOn,
    });

    return ok(task);
  }

  /**
   * Start a run for a task.
   *
   * Process:
   * 1. Load task and validate state
   * 2. Check if dependencies are met
   * 3. Load project to get repo path
   * 4. Create workspace via workspace manager
   * 5. Spawn agent with task description as prompt
   * 6. Transition task state: READY → RUNNING
   * 7. Return run record
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

    // Check if dependencies are met
    const depsMet = await this.dependencyResolver.areDependenciesMet(taskId);

    if (depsMet.isErr()) {
      return err(depsMet.error);
    }

    if (!depsMet.value) {
      return err(
        new FlockErrorClass(
          'DATABASE_ERROR',
          `Task dependencies are not met. Cannot start run.`,
          { taskId }
        )
      );
    }

    // Check parallel run limit if queue is enabled
    if (config.queueEnabled) {
      const canStart = await this.scheduler.canStartRun(agentId);

      if (canStart.isErr()) {
        return err(canStart.error);
      }

      if (!canStart.value) {
        // Queue the run instead
        const queueResult = await this.scheduler.addToQueue(taskId, agentId);

        if (queueResult.isErr()) {
          return err(queueResult.error);
        }

        // Return a queued run record
        const queuedRun = await this.scheduler.getRun(queueResult.value);

        if (queuedRun.isErr()) {
          return err(queuedRun.error);
        }

        auditLog('run_queued', agentId, queuedRun.value.id, {
          taskId,
          agentId,
        });

        return ok(queuedRun.value);
      }
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

    // Update run with workspace and branch info via scheduler
    await this.scheduler.updateRunStartInfo(run.id, workspacePath, branchName);

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

  // ============================================================================
  // Retry Methods
  // ============================================================================

  /**
   * Evaluate whether a retry should occur for a run.
   *
   * Uses the configured retry policy to determine if a retry
   * is appropriate based on failure type and attempt count.
   */
  async evaluateRetry(runId: string): Promise<Result<{ shouldRetry: boolean; reason: string; attempt: number }, FlockError>> {
    const policy = this.config.retry;
    if (!policy) {
      return ok({ shouldRetry: false, reason: 'Retry policy not configured', attempt: 0 });
    }

    const result = await this.retryEngine.evaluateRetry(runId, policy);
    if (result.isErr()) {
      return err(result.error);
    }

    const decision = result.value;
    return ok({
      shouldRetry: decision.shouldRetry,
      reason: decision.reason,
      attempt: decision.attempt,
    });
  }

  /**
   * Execute a retry for a task.
   *
   * Creates a new run for the task and logs the retry event.
   */
  async executeRetry(taskId: string): Promise<Result<Run, FlockError>> {
    const policy = this.config.retry;
    if (!policy) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', 'Retry policy not configured', {
          taskId,
        })
      );
    }

    const result = await this.retryEngine.executeRetry(taskId, policy);
    if (result.isErr()) {
      return err(result.error);
    }

    auditLog('retry_executed', 'system', taskId, {
      retryRunId: result.value.id,
    });

    return result;
  }

  /**
   * Get retry history for a task.
   */
  async getRetryHistory(taskId: string): Promise<Result<Array<{ attempt: number; reason: string; triggeredAt: string }>, FlockError>> {
    const result = await this.retryEngine.getRetryHistory(taskId);
    if (result.isErr()) {
      return err(result.error);
    }

    return ok(result.value.map((r) => ({
      attempt: r.attempt,
      reason: r.reason,
      triggeredAt: r.triggeredAt,
    })));
  }

  /**
   * Check if max retries have been exceeded for a task.
   */
  async shouldEscalate(taskId: string): Promise<Result<boolean, FlockError>> {
    const policy = this.config.retry;
    if (!policy) {
      return ok(false);
    }

    const result = await this.retryEngine.shouldEscalate(taskId, policy);
    return ok(result);
  }

  // ============================================================================
  // Reviewer Methods
  // ============================================================================

  /**
   * Assign a reviewer agent to review a task.
   *
   * Creates a reviewer assignment and provides context
   * (diff, gate results) for the review.
   */
  async assignReviewer(taskId: string, config: ReviewerConfig): Promise<Result<ReviewerAssignment, FlockError>> {
    const result = await this.reviewerEngine.assignReviewer(taskId, config);
    if (result.isErr()) {
      return err(result.error);
    }

    auditLog('reviewer_assigned', config.agentId, taskId, {
      mode: config.mode,
      requiredApprovals: config.requiredApprovals,
    });

    return result;
  }

  /**
   * Check if review consensus has been reached.
   *
   * Evaluates all reviews for a task and determines
   * if consensus has been reached based on policy.
   */
  async checkReviewConsensus(taskId: string): Promise<Result<ConsensusResult, FlockError>> {
    const policy = this.config.review;
    if (!policy) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', 'Review policy not configured', {
          taskId,
        })
      );
    }

    const reviewerConfig: ReviewerConfig = {
      agentId: 'system',
      mode: policy.mode,
      requiredApprovals: policy.requiredApprovals,
      autoRejectThreshold: policy.autoRejectThreshold,
    };

    const result = await this.reviewerEngine.checkConsensus(taskId, reviewerConfig);
    if (result.isErr()) {
      return err(result.error);
    }

    auditLog('consensus_checked', 'system', taskId, {
      reached: result.value.reached,
      verdict: result.value.verdict,
      approvalCount: result.value.approvalCount,
      rejectionCount: result.value.rejectionCount,
    });

    return result;
  }

  /**
   * Auto-review a task with a specific agent.
   *
   * Spawns a read-only reviewer agent to evaluate changes
   * and records the review verdict.
   */
  async autoReview(taskId: string, agentId: string): Promise<Result<Review, FlockError>> {
    const result = await this.reviewerEngine.autoReview(taskId, agentId);
    if (result.isErr()) {
      return err(result.error);
    }

    auditLog('auto_review_completed', agentId, taskId, {
      reviewId: result.value.id,
      verdict: result.value.verdict,
    });

    return result;
  }

  // ============================================================================
  // Workflow Pattern Methods
  // ============================================================================

  /**
   * Execute a sequential chain workflow.
   *
   * Creates tasks with dependency chain: A → B → C
   * Returns the created task IDs.
   */
  async executeSequentialChain(
    chain: SequentialChain,
    projectId: string
  ): Promise<Result<{ taskIds: string[]; tasks: Task[] }, FlockError>> {
    const result = await this.workflowRunner.executeSequentialChain(chain, {
      projectId,
      autoStart: false,
      queueEnabled: true,
    });

    if (result.isErr()) {
      return err(result.error);
    }

    auditLog('workflow_sequential_created', 'system', projectId, {
      taskCount: result.value.taskIds.length,
    });

    return ok({
      taskIds: result.value.taskIds,
      tasks: result.value.tasks || [],
    });
  }

  /**
   * Execute a parallel fan-out workflow.
   *
   * Creates source task then multiple parallel targets.
   * Returns the created task IDs.
   */
  async executeParallelFanOut(
    fanOut: ParallelFanOut,
    projectId: string
  ): Promise<Result<{ taskIds: string[]; tasks: Task[] }, FlockError>> {
    const result = await this.workflowRunner.executeParallelFanOut(fanOut, {
      projectId,
      autoStart: false,
      queueEnabled: true,
    });

    if (result.isErr()) {
      return err(result.error);
    }

    auditLog('workflow_fanout_created', 'system', projectId, {
      taskCount: result.value.taskIds.length,
    });

    return ok({
      taskIds: result.value.taskIds,
      tasks: result.value.tasks || [],
    });
  }

  /**
   * Execute a fan-in workflow.
   *
   * Creates multiple source tasks then a fan-in target.
   * Returns the created task IDs.
   */
  async executeFanIn(
    fanIn: FanIn,
    projectId: string
  ): Promise<Result<{ taskIds: string[]; tasks: Task[] }, FlockError>> {
    const result = await this.workflowRunner.executeFanIn(fanIn, {
      projectId,
      autoStart: false,
      queueEnabled: true,
    });

    if (result.isErr()) {
      return err(result.error);
    }

    auditLog('workflow_fanin_created', 'system', projectId, {
      taskCount: result.value.taskIds.length,
    });

    return ok({
      taskIds: result.value.taskIds,
      tasks: result.value.tasks || [],
    });
  }

  /**
   * Execute a review pipeline workflow.
   *
   * Creates implement → test → review chain with review gate.
   * Returns the created task IDs.
   */
  async executeReviewPipeline(
    pipeline: ReviewPipeline,
    projectId: string
  ): Promise<Result<{ taskIds: string[]; tasks: Task[] }, FlockError>> {
    const result = await this.workflowRunner.executeReviewPipeline(pipeline, {
      projectId,
      autoStart: false,
      queueEnabled: true,
    });

    if (result.isErr()) {
      return err(result.error);
    }

    auditLog('workflow_review_pipeline_created', 'system', projectId, {
      taskCount: result.value.taskIds.length,
    });

    return ok({
      taskIds: result.value.taskIds,
      tasks: result.value.tasks || [],
    });
  }

  // ============================================================================
  // Full Orchestration Methods
  // ============================================================================

  /**
   * Orchestrate a task with automatic retry on failure.
   *
   * Process:
   * 1. Start run for the task
   * 2. Monitor for completion
   * 3. On failure, evaluate retry policy
   * 4. If retry allowed, execute retry
   * 5. Repeat until success or max retries
   *
   * @param taskId - Task ID to orchestrate
   * @param agentId - Agent to run the task
   * @param retryPolicy - Optional retry policy (uses config default if not provided)
   */
  async orchestrateWithRetry(
    taskId: string,
    agentId: string,
    retryPolicy?: RetryPolicy
  ): Promise<Result<Run, FlockError>> {
    // Use config retry policy if not provided
    const policy = retryPolicy || this.config.retry;
    if (!policy) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', 'Retry policy not configured', {
          taskId,
        })
      );
    }

    // Start the initial run
    const startResult = await this.startRun(taskId, agentId, {
      queueEnabled: true,
    });

    if (startResult.isErr()) {
      return err(startResult.error);
    }

    const run = startResult.value;

    auditLog('orchestrate_with_retry_started', agentId, taskId, {
      runId: run.id,
      maxRetries: policy.maxRetries,
    });

    // Note: In a full implementation, this would monitor the run
    // and automatically retry on failure. For now, we return the run
    // and the caller is responsible for monitoring and retrying.

    return ok(run);
  }

  /**
   * Orchestrate a task with automatic review assignment.
   *
   * Process:
   * 1. Start run for the task
   * 2. Monitor for completion
   * 3. On completion, assign reviewer based on config
   * 4. Wait for consensus before transitioning to APPROVED
   *
   * @param taskId - Task ID to orchestrate
   * @param agentId - Agent to run the task
   * @param reviewerConfig - Reviewer configuration
   */
  async orchestrateWithReview(
    taskId: string,
    agentId: string,
    reviewerConfig: ReviewerConfig
  ): Promise<Result<Review, FlockError>> {
    // Start the run
    const startResult = await this.startRun(taskId, agentId, {
      queueEnabled: true,
    });

    if (startResult.isErr()) {
      return err(startResult.error);
    }

    const run = startResult.value;

    auditLog('orchestrate_with_review_started', agentId, taskId, {
      runId: run.id,
      reviewMode: reviewerConfig.mode,
    });

    // Assign reviewer
    const assignResult = await this.assignReviewer(taskId, reviewerConfig);

    if (assignResult.isErr()) {
      return err(assignResult.error);
    }

    // Note: In a full implementation, this would:
    // - Monitor the run for completion
    // - Automatically trigger review when run completes
    // - Wait for consensus before transitioning to APPROVED
    // For now, we return the assignment and the caller is responsible
    // for monitoring and checking consensus.

    // Return a placeholder review object
    return ok({
      id: randomUUID(),
      task_id: taskId,
      reviewer: reviewerConfig.agentId,
      verdict: 'ASK_ANOTHER_AGENT',
      comment: 'Review assigned, awaiting completion',
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Orchestrate the full lifecycle of a task.
   *
   * Process:
   * 1. Create task (if taskId is 'new')
   * 2. Start run with queue support
   * 3. Monitor for completion
   * 4. Run gates if configured
   * 5. On gate failure, evaluate retry policy
   * 6. If retry exhausted, escalate
   * 7. On success, assign reviewer if review required
   * 8. Wait for consensus
   * 9. Transition to APPROVED
   * 10. Return final task state
   *
   * This is the "one-shot" method that handles everything.
   *
   * @param taskIdOrSpec - Either an existing task ID, or a spec to create a new task
   * @param agentId - Agent to run the task
   * @param options - Optional configuration
   */
  async orchestrateFull(
    taskIdOrSpec: string | { projectId: string; title: string; description?: string },
    agentId: string,
    options: {
      /** Retry policy override */
      retryPolicy?: RetryPolicy;
      /** Reviewer config override */
      reviewerConfig?: ReviewerConfig;
      /** Whether to auto-merge on approval */
      autoMerge?: boolean;
    } = {}
  ): Promise<Result<Task, FlockError>> {
    let taskId: string;

    // Create task if needed
    if (typeof taskIdOrSpec === 'string') {
      taskId = taskIdOrSpec;
    } else {
      const createResult = await this.createTask(
        taskIdOrSpec.projectId,
        taskIdOrSpec.title,
        {
          description: taskIdOrSpec.description,
        }
      );

      if (createResult.isErr()) {
        return err(createResult.error);
      }

      taskId = createResult.value.id;
    }

    // Start run with retry support
    const startResult = await this.startRun(taskId, agentId, {
      queueEnabled: true,
    });

    if (startResult.isErr()) {
      return err(startResult.error);
    }

    auditLog('orchestrate_full_started', agentId, taskId, {
      runId: startResult.value.id,
      autoMerge: options.autoMerge,
    });

    // Note: In a full implementation, this would:
    // - Monitor the run asynchronously
    // - Execute gates on completion
    // - Handle retries on failure
    // - Assign reviewers on success
    // - Auto-merge if approved and autoMerge is true
    //
    // For now, we return the current task state and the caller
    // is responsible for monitoring the lifecycle.

    // Get the current task state
    const task = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.id, taskId))
      .get();

    if (!task) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Failed to retrieve task: ${taskId}`, {
          taskId,
        })
      );
    }

    return ok({
      id: task.id,
      project_id: task.project_id,
      title: task.title,
      description: task.description,
      status: task.status as Task['status'],
      priority: task.priority as Task['priority'],
      requires_review: task.requires_review,
      created_at: task.created_at,
      updated_at: task.updated_at,
    });
  }
}

/**
 * Factory function to create an orchestrator.
 */
export function createOrchestrator(db: FlockDatabase, config: FlockConfig): FlockOrchestrator {
  return new FlockOrchestrator(db, config);
}
