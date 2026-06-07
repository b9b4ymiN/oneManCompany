/**
 * Flock Workflow Runner
 *
 * Executes workflow patterns by creating tasks with proper dependencies
 * and optionally starting runs for them.
 */

import { ok, err, type Result } from 'neverthrow';
import { eq } from 'drizzle-orm';
import type { FlockDatabase } from '../db/client';
import type { FlockError, Task } from '../types';
import { FlockError as FlockErrorClass } from '../types';
import type {
  SequentialChain,
  ParallelFanOut,
  FanIn,
  ReviewPipeline,
  WorkflowResult,
  WorkflowConfig,
} from './patterns';

/**
 * Workflow Runner
 *
 * Executes workflow patterns to create task structures.
 */
export class WorkflowRunner {
  constructor(private readonly db: FlockDatabase) {}

  /**
   * Execute a Sequential Chain workflow.
   *
   * Creates tasks with dependency chain: A → B → C
   * Each task depends on the previous being MERGED.
   *
   * @example
   * ```ts
   * const result = await runner.executeSequentialChain({
   *   tasks: [
   *     { title: 'Design API', agentId: 'architect', description: '...' },
   *     { title: 'Implement API', agentId: 'dev', description: '...' },
   *     { title: 'Write tests', agentId: 'tester', description: '...' },
   *   ]
   * }, 'project-123');
   * ```
   */
  async executeSequentialChain(
    chain: SequentialChain,
    config: WorkflowConfig
  ): Promise<Result<WorkflowResult, FlockError>> {
    const { projectId } = config;
    const createdTasks: Task[] = [];
    const taskIds: string[] = [];
    const dependencies: string[] = [];

    // Create tasks in order, building dependency chain
    for (const taskSpec of chain.tasks) {
      const taskId = await this.#createTask(
        projectId,
        taskSpec.title,
        taskSpec.description,
        taskSpec.priority,
        dependencies,
        taskSpec.agentId
      );

      if (taskId.isErr()) {
        return err(taskId.error);
      }

      taskIds.push(taskId.value);
      // Each task depends on the previous one
      dependencies.push(taskId.value);

      // Fetch the created task for the result
      const task = await this.db.db
        .select()
        .from(this.db.schema.tasks)
        .where(eq(this.db.schema.tasks.id, taskId.value))
        .get();

      if (task) {
        createdTasks.push({
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

    return ok({
      taskIds,
      status: 'created',
      tasks: createdTasks,
    });
  }

  /**
   * Execute a Parallel Fan-Out workflow.
   *
   * Creates a source task, then multiple targets that all depend on it.
   * Structure: Source → [Target1, Target2, Target3, ...]
   *
   * @example
   * ```ts
   * const result = await runner.executeParallelFanOut({
   *   sourceTask: { title: 'Design schema', agentId: 'architect' },
   *   targets: [
   *     { title: 'Implement backend', agentId: 'dev-backend' },
   *     { title: 'Implement frontend', agentId: 'dev-frontend' },
   *     { title: 'Write docs', agentId: 'writer' },
   *   ]
   * }, 'project-123');
   * ```
   */
  async executeParallelFanOut(
    fanOut: ParallelFanOut,
    config: WorkflowConfig
  ): Promise<Result<WorkflowResult, FlockError>> {
    const { projectId } = config;
    const createdTasks: Task[] = [];
    const taskIds: string[] = [];

    // Create source task
    const sourceTaskId = await this.#createTask(
      projectId,
      fanOut.sourceTask.title,
      fanOut.sourceTask.description,
      undefined,
      [],
      fanOut.sourceTask.agentId
    );

    if (sourceTaskId.isErr()) {
      return err(sourceTaskId.error);
    }

    taskIds.push(sourceTaskId.value);

    // Fetch the source task
    const sourceTask = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.id, sourceTaskId.value))
      .get();

    if (sourceTask) {
      createdTasks.push({
        id: sourceTask.id,
        project_id: sourceTask.project_id,
        title: sourceTask.title,
        description: sourceTask.description,
        status: sourceTask.status as Task['status'],
        priority: sourceTask.priority as Task['priority'],
        requires_review: sourceTask.requires_review,
        created_at: sourceTask.created_at,
        updated_at: sourceTask.updated_at,
      });
    }

    // Create all target tasks with dependency on source
    const sourceDependencies = [sourceTaskId.value];

    for (const target of fanOut.targets) {
      const targetTaskId = await this.#createTask(
        projectId,
        target.title,
        target.description,
        target.priority,
        sourceDependencies,
        target.agentId
      );

      if (targetTaskId.isErr()) {
        // Return partial success
        return ok({
          taskIds,
          status: 'partial',
          error: `Failed to create target task: ${targetTaskId.error.message}`,
          tasks: createdTasks,
        });
      }

      taskIds.push(targetTaskId.value);

      // Fetch the target task
      const targetTask = await this.db.db
        .select()
        .from(this.db.schema.tasks)
        .where(eq(this.db.schema.tasks.id, targetTaskId.value))
        .get();

      if (targetTask) {
        createdTasks.push({
          id: targetTask.id,
          project_id: targetTask.project_id,
          title: targetTask.title,
          description: targetTask.description,
          status: targetTask.status as Task['status'],
          priority: targetTask.priority as Task['priority'],
          requires_review: targetTask.requires_review,
          created_at: targetTask.created_at,
          updated_at: targetTask.updated_at,
        });
      }
    }

    return ok({
      taskIds,
      status: 'created',
      tasks: createdTasks,
    });
  }

  /**
   * Execute a Fan-In workflow.
   *
   * Creates multiple source tasks, then a target that depends on all of them.
   * Structure: [Source1, Source2, Source3] → Target
   *
   * @example
   * ```ts
   * const result = await runner.executeFanIn({
   *   sourceTasks: [
   *     { title: 'Backend API', agentId: 'dev-backend' },
   *     { title: 'Frontend UI', agentId: 'dev-frontend' },
   *     { title: 'Documentation', agentId: 'writer' },
   *   ],
   *   target: { title: 'Integration test', agentId: 'tester' }
   * }, 'project-123');
   * ```
   */
  async executeFanIn(
    fanIn: FanIn,
    config: WorkflowConfig
  ): Promise<Result<WorkflowResult, FlockError>> {
    const { projectId } = config;
    const createdTasks: Task[] = [];
    const taskIds: string[] = [];
    const sourceTaskIds: string[] = [];

    // Create all source tasks
    for (const source of fanIn.sourceTasks) {
      const sourceTaskId = await this.#createTask(
        projectId,
        source.title,
        source.description,
        source.priority,
        [],
        source.agentId
      );

      if (sourceTaskId.isErr()) {
        return err(sourceTaskId.error);
      }

      sourceTaskIds.push(sourceTaskId.value);
      taskIds.push(sourceTaskId.value);

      // Fetch the source task
      const sourceTask = await this.db.db
        .select()
        .from(this.db.schema.tasks)
        .where(eq(this.db.schema.tasks.id, sourceTaskId.value))
        .get();

      if (sourceTask) {
        createdTasks.push({
          id: sourceTask.id,
          project_id: sourceTask.project_id,
          title: sourceTask.title,
          description: sourceTask.description,
          status: sourceTask.status as Task['status'],
          priority: sourceTask.priority as Task['priority'],
          requires_review: sourceTask.requires_review,
          created_at: sourceTask.created_at,
          updated_at: sourceTask.updated_at,
        });
      }
    }

    // Create target task with all sources as dependencies
    const targetTaskId = await this.#createTask(
      projectId,
      fanIn.target.title,
      fanIn.target.description,
      fanIn.target.priority,
      sourceTaskIds,
      fanIn.target.agentId
    );

    if (targetTaskId.isErr()) {
      return ok({
        taskIds,
        status: 'partial',
        error: `Failed to create fan-in target: ${targetTaskId.error.message}`,
        tasks: createdTasks,
      });
    }

    taskIds.push(targetTaskId.value);

    // Fetch the target task
    const targetTask = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.id, targetTaskId.value))
      .get();

    if (targetTask) {
      createdTasks.push({
        id: targetTask.id,
        project_id: targetTask.project_id,
        title: targetTask.title,
        description: targetTask.description,
        status: targetTask.status as Task['status'],
        priority: targetTask.priority as Task['priority'],
        requires_review: targetTask.requires_review,
        created_at: targetTask.created_at,
        updated_at: targetTask.updated_at,
      });
    }

    return ok({
      taskIds,
      status: 'created',
      tasks: createdTasks,
    });
  }

  /**
   * Execute a Review Pipeline workflow.
   *
   * Creates implement → test → review chain with review gate.
   * Structure: Implement → Test → Review → Merge
   *
   * @example
   * ```ts
   * const result = await runner.executeReviewPipeline({
   *   implement: { agentId: 'claude', title: 'Fix parser bug', description: '...' },
   *   test: { agentId: 'codex', description: 'Run tests and verify' },
   *   review: { agentId: 'gemini', requiredApprovals: 1 }
   * }, 'project-123');
   * ```
   */
  async executeReviewPipeline(
    pipeline: ReviewPipeline,
    config: WorkflowConfig
  ): Promise<Result<WorkflowResult, FlockError>> {
    const { projectId } = config;
    const createdTasks: Task[] = [];
    const taskIds: string[] = [];

    // Create implementation task
    const implTaskId = await this.#createTask(
      projectId,
      pipeline.implement.title,
      pipeline.implement.description,
      pipeline.implement.priority,
      [],
      pipeline.implement.agentId,
      true // requires review
    );

    if (implTaskId.isErr()) {
      return err(implTaskId.error);
    }

    taskIds.push(implTaskId.value);

    // Fetch the implementation task
    const implTask = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.id, implTaskId.value))
      .get();

    if (implTask) {
      createdTasks.push({
        id: implTask.id,
        project_id: implTask.project_id,
        title: implTask.title,
        description: implTask.description,
        status: implTask.status as Task['status'],
        priority: implTask.priority as Task['priority'],
        requires_review: implTask.requires_review,
        created_at: implTask.created_at,
        updated_at: implTask.updated_at,
      });
    }

    // Create testing task that depends on implementation
    const testDescription = pipeline.test.description || `Test and verify: ${pipeline.implement.title}`;
    const testTaskId = await this.#createTask(
      projectId,
      `Test: ${pipeline.implement.title}`,
      testDescription,
      undefined,
      [implTaskId.value],
      pipeline.test.agentId
    );

    if (testTaskId.isErr()) {
      return ok({
        taskIds,
        status: 'partial',
        error: `Failed to create test task: ${testTaskId.error.message}`,
        tasks: createdTasks,
      });
    }

    taskIds.push(testTaskId.value);

    // Fetch the test task
    const testTask = await this.db.db
      .select()
      .from(this.db.schema.tasks)
      .where(eq(this.db.schema.tasks.id, testTaskId.value))
      .get();

    if (testTask) {
      createdTasks.push({
        id: testTask.id,
        project_id: testTask.project_id,
        title: testTask.title,
        description: testTask.description,
        status: testTask.status as Task['status'],
        priority: testTask.priority as Task['priority'],
        requires_review: testTask.requires_review,
        created_at: testTask.created_at,
        updated_at: testTask.updated_at,
      });
    }

    // Review is handled by the reviewer engine, not a separate task
    // The implementation task has requires_review=true
    // Reviewers will be assigned via the orchestrator

    return ok({
      taskIds,
      status: 'created',
      tasks: createdTasks,
    });
  }

  /**
   * Create a task with optional dependencies.
   *
   * Private helper method.
   */
  async #createTask(
    projectId: string,
    title: string,
    description: string | undefined,
    priority: 'low' | 'medium' | 'high' | 'critical' | undefined,
    dependencies: string[],
    agentId: string,
    requiresReview = false
  ): Promise<Result<string, FlockError>> {
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
    await this.db.db.insert(this.db.schema.tasks).values({
      id: taskId,
      project_id: projectId,
      title,
      description: description || '',
      status: 'DRAFT',
      priority: priority || 'medium',
      requires_review: requiresReview,
      created_at: now,
      updated_at: now,
    });

    // Add dependencies if provided
    if (dependencies.length > 0) {
      for (const depId of dependencies) {
        await this.db.db.insert(this.db.schema.task_dependencies).values({
          task_id: taskId,
          depends_on_task_id: depId,
        });
      }
    }

    return ok(taskId);
  }
}

/**
 * Factory function to create a workflow runner.
 */
export function createWorkflowRunner(db: FlockDatabase): WorkflowRunner {
  return new WorkflowRunner(db);
}
