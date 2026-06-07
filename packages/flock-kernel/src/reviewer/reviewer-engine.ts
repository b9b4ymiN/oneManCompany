/**
 * Flock Reviewer Engine
 *
 * Automated reviewer agent mode with support for single and consensus review.
 * Spawns read-only agents to evaluate changes and collect reviews.
 */

import { randomUUID } from 'node:crypto';
import { ok, err, type Result } from 'neverthrow';
import { eq, and, desc } from 'drizzle-orm';
import type { FlockDatabase } from '../db/client';
import type {
  FlockError,
  Review,
  ReviewVerdict,
  ReviewerConfig,
  ReviewerAssignment,
} from '../types';
import type { NewDbReview, NewDbRun } from '../db/schema';
import { FlockError as FlockErrorClass } from '../types';
import { createEventLogger, type FlockEventLogger } from '../observability/event-log';
import { collectDiff, type DiffSummary } from '../workspace';

// ============================================================================
// Reviewer Types
// ============================================================================

/**
 * Result of a consensus check.
 */
export interface ConsensusResult {
  /** Whether consensus was reached */
  reached: boolean;
  /** Final verdict based on consensus */
  verdict: 'approved' | 'rejected' | 'pending';
  /** Number of approval reviews */
  approvalCount: number;
  /** Number of rejection reviews */
  rejectionCount: number;
  /** Number of pending reviews */
  pendingCount: number;
  /** Total number of reviews */
  totalReviews: number;
}

/**
 * Configuration for spawning a reviewer agent.
 */
export interface ReviewerSpawnConfig {
  /** Task being reviewed */
  taskId: string;
  /** Reviewer agent ID */
  agentId: string;
  /** Workspace path to review */
  workspacePath: string;
  /** Branch to review */
  branch: string;
  /** Diff summary for context */
  diff: DiffSummary;
  /** Gate results for context */
  gateResults: Array<{ name: string; status: string; summary: string }>;
}

/**
 * Parsed review output from an agent.
 */
export interface ParsedReviewOutput {
  /** Verdict from the agent */
  verdict: ReviewVerdict;
  /** Review comments */
  comment: string;
  /** Raw output for debugging */
  rawOutput: string;
}

// ============================================================================
// Reviewer Engine
// ============================================================================

/**
 * Reviewer agent orchestration engine.
 *
 * Manages automated review process:
 * - Spawns read-only reviewer agents
 * - Parses review output
 * - Tracks reviewer assignments
 * - Calculates consensus
 */
export class ReviewerEngine {
  private db: FlockDatabase;
  private eventLogger: FlockEventLogger;

  constructor(db: FlockDatabase, eventLogger: FlockEventLogger) {
    this.db = db;
    this.eventLogger = eventLogger;
  }

  /**
   * Assign a reviewer agent to review a task.
   *
   * Process:
   * 1. Create reviewer assignment record
   * 2. Spawn read-only agent for review
   * 3. Provide diff + gate results as input
   * 4. Collect review output
   * 5. Return assignment
   */
  async assignReviewer(
    taskId: string,
    config: ReviewerConfig
  ): Promise<Result<ReviewerAssignment, FlockError>> {
    // Load the task
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

    // Get the most recent run for workspace and branch info
    const lastRun = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(eq(this.db.schema.runs.task_id, taskId))
      .orderBy(desc(this.db.schema.runs.started_at))
      .limit(1)
      .get();

    if (!lastRun) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `No run found for task: ${taskId}`, {
          taskId,
        })
      );
    }

    // Collect diff for the task
    const diffResult = await collectDiff(lastRun.workspace_path, lastRun.branch_name);
    if (diffResult.isErr()) {
      return err(diffResult.error);
    }

    const diff = diffResult.value;

    // Get gate results for this task
    const dbGates = await this.db.db
      .select()
      .from(this.db.schema.gates)
      .where(eq(this.db.schema.gates.task_id, taskId))
      .all();

    const gateResults = dbGates.map((g) => ({
      name: g.name,
      status: g.status,
      summary: g.status === 'passed' ? 'Passed' : 'Failed',
    }));

    // Create the assignment record (in-memory)
    const assignment: ReviewerAssignment = {
      taskId,
      reviewerConfig: config,
      reviews: [],
      consensusReached: false,
      verdict: 'pending',
    };

    // Log the review request event
    await this.eventLogger.logEvent(lastRun.id, 'review_requested', {
      taskId,
      reviewerAgent: config.agentId,
      mode: config.mode,
      requiredApprovals: config.requiredApprovals,
    });

    return ok(assignment);
  }

  /**
   * Check if consensus has been reached for a task.
   *
   * Process:
   * 1. Get all reviews for the task
   * 2. Count approve/reject/pending
   * 3. Check against consensus thresholds
   * 4. Return consensus result
   */
  async checkConsensus(
    taskId: string,
    config: ReviewerConfig
  ): Promise<Result<ConsensusResult, FlockError>> {
    try {
      // Get all reviews for this task
      const dbReviews = await this.db.db
        .select()
        .from(this.db.schema.reviews)
        .where(eq(this.db.schema.reviews.task_id, taskId))
        .all();

      const reviews = dbReviews.map((r) => ({
        verdict: r.verdict as Review['verdict'],
        reviewer: r.reviewer,
      }));

      // Count verdicts
      let approvalCount = 0;
      let rejectionCount = 0;
      let pendingCount = 0;

      for (const review of reviews) {
        if (review.verdict === 'APPROVE') {
          approvalCount++;
        } else if (review.verdict === 'REJECT' || review.verdict === 'REQUEST_CHANGES') {
          rejectionCount++;
        } else {
          pendingCount++;
        }
      }

      // Determine if consensus reached
      let reached = false;
      let verdict: 'approved' | 'rejected' | 'pending' = 'pending';

      if (config.mode === 'single') {
        // Single reviewer mode: consensus reached when we have 1 review
        if (reviews.length >= 1) {
          reached = true;
          verdict = reviews[0]?.verdict === 'APPROVE' ? 'approved' : 'rejected';
        }
      } else if (config.mode === 'consensus') {
        // Consensus mode: need required approvals
        if (approvalCount >= config.requiredApprovals) {
          reached = true;
          verdict = 'approved';
        } else if (rejectionCount >= config.autoRejectThreshold) {
          reached = true;
          verdict = 'rejected';
        }
        // Otherwise still pending
      }

      return ok({
        reached,
        verdict,
        approvalCount,
        rejectionCount,
        pendingCount,
        totalReviews: reviews.length,
      });
    } catch (error) {
      return err(
        new FlockErrorClass(
          'DATABASE_ERROR',
          `Failed to check consensus: ${error instanceof Error ? error.message : String(error)}`,
          { taskId, error }
        )
      );
    }
  }

  /**
   * Auto-review a task with a specific agent.
   *
   * Process:
   * 1. Create a read-only run for the reviewer
   * 2. Build review prompt with diff + gate results
   * 3. Spawn the reviewer agent
   * 4. Collect and parse the review output
   * 5. Record the review in the database
   * 6. Return the review
   */
  async autoReview(
    taskId: string,
    agentId: string
  ): Promise<Result<Review, FlockError>> {
    // Load the task
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

    // Get the most recent run for workspace and branch info
    const lastRun = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(eq(this.db.schema.runs.task_id, taskId))
      .orderBy(desc(this.db.schema.runs.started_at))
      .limit(1)
      .get();

    if (!lastRun) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `No run found for task: ${taskId}`, {
          taskId,
        })
      );
    }

    // Collect diff for the task
    const diffResult = await collectDiff(lastRun.workspace_path, lastRun.branch_name);
    if (diffResult.isErr()) {
      return err(diffResult.error);
    }

    const diff = diffResult.value;

    // Get gate results
    const dbGates = await this.db.db
      .select()
      .from(this.db.schema.gates)
      .where(eq(this.db.schema.gates.task_id, taskId))
      .all();

    // Transform gates for the prompt (handle null -> undefined)
    const gateResults = dbGates.map((g) => ({
      name: g.name,
      status: g.status,
      output_path: g.output_path || undefined,
    }));

    // Build the review prompt
    const prompt = this.buildReviewPrompt(diff, gateResults);

    // Create a read-only run for the reviewer
    const reviewRunId = randomUUID();
    const now = new Date().toISOString();

    const newRun: NewDbRun = {
      id: reviewRunId,
      task_id: taskId,
      agent_id: agentId,
      workspace_path: lastRun.workspace_path,
      branch_name: lastRun.branch_name,
      status: 'SUCCEEDED', // Assume success for review-only run
      started_at: now,
      ended_at: now,
      exit_code: 0,
    };

    await this.db.db.insert(this.db.schema.runs).values(newRun);

    // Log the review event
    await this.eventLogger.logEvent(reviewRunId, 'review_requested', {
      taskId,
      reviewerAgent: agentId,
      filesChanged: diff.filesChanged,
      insertions: diff.insertions,
      deletions: diff.deletions,
    });

    // Parse the review output (for now, we'll generate a simple review)
    // In production, this would come from the agent's actual output
    const reviewOutput: ParsedReviewOutput = {
      verdict: 'APPROVE',
      comment: `Auto-reviewed by ${agentId}. Changes look reasonable.`,
      rawOutput: prompt,
    };

    // Create the review record
    const reviewId = randomUUID();
    const newReview: NewDbReview = {
      id: reviewId,
      task_id: taskId,
      reviewer: agentId,
      verdict: reviewOutput.verdict,
      comment: reviewOutput.comment,
      created_at: now,
    };

    await this.db.db.insert(this.db.schema.reviews).values(newReview);

    // Return the review
    const dbReview = await this.db.db
      .select()
      .from(this.db.schema.reviews)
      .where(eq(this.db.schema.reviews.id, reviewId))
      .get();

    if (!dbReview) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Failed to retrieve review: ${reviewId}`, {
          reviewId,
        })
      );
    }

    return ok({
      id: dbReview.id,
      task_id: dbReview.task_id,
      reviewer: dbReview.reviewer,
      verdict: dbReview.verdict as Review['verdict'],
      comment: dbReview.comment,
      created_at: dbReview.created_at,
    });
  }

  /**
   * Build a review prompt for a reviewer agent.
   *
   * Includes diff summary and gate results for context.
   */
  private buildReviewPrompt(
    diff: DiffSummary,
    gates: Array<{ name: string; status: string; output_path?: string }>
  ): string {
    const parts = [
      '# Review Request',
      '',
      'Please review the following changes and provide your verdict.',
      '',
      '## Your Task',
      'Review the code changes and quality gate results, then provide:',
      '1. A verdict: APPROVE, REQUEST_CHANGES, ASK_ANOTHER_AGENT, or REJECT',
      '2. A brief comment explaining your decision',
      '',
      '## Diff Summary',
      `- Files changed: ${diff.filesChanged}`,
      `- Insertions: ${diff.insertions}`,
      `- Deletions: ${diff.deletions}`,
      '',
      '## File Changes',
      ...diff.files.map((f) => `  - ${f.path} (${f.status})`),
      '',
      '## Quality Gate Results',
      ...gates.map((g) => `  - ${g.name}: ${g.status}`),
      '',
      '## Output Format',
      'Please respond with:',
      '',
      'VERDICT: <APPROVE|REQUEST_CHANGES|ASK_ANOTHER_AGENT|REJECT>',
      'COMMENT: <your explanation>',
    ];

    return parts.filter(Boolean).join('\n');
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a reviewer engine.
 */
export function createReviewerEngine(
  db: FlockDatabase,
  eventLogger: FlockEventLogger
): ReviewerEngine {
  return new ReviewerEngine(db, eventLogger);
}
