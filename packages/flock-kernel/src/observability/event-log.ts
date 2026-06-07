/**
 * Flock Event Logger
 *
 * Event logging for agent runs and task lifecycle.
 * Writes events to both database and append-only log files.
 */

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { eq, and, desc } from 'drizzle-orm';
import { ok, err, type Result } from 'neverthrow';
import type { FlockDatabase } from '../db/client';
import type { Event, AgentEventType, Run, GateResult, Review } from '../types';
import type { DbEvent, NewDbEvent } from '../db/schema';
import type { DiffSummary } from '../workspace/branch-manager';
import { FlockError, FlockError as FlockErrorClass } from '../types';

/**
 * Timeline entry for a run.
 */
export interface TimelineEntry {
  /** The run */
  run: Run;
  /** Events for this run */
  events: Event[];
  /** Gate results for this run */
  gateResults: GateResult[];
  /** Diff summary for this run */
  diff?: DiffSummary;
}

/**
 * Complete timeline for a task across all runs.
 */
export interface RunTimeline {
  /** Task ID */
  taskId: string;
  /** All runs for this task */
  runs: TimelineEntry[];
  /** All reviews for this task */
  reviews: Review[];
}

/**
 * Flock Event Logger
 *
 * Logs events to both database and file system.
 */
export class FlockEventLogger {
  private db: FlockDatabase;
  private basePath: string;

  constructor(db: FlockDatabase, basePath: string) {
    this.db = db;
    this.basePath = basePath;
  }

  /**
   * Log an event for a run.
   *
   * Writes to:
   * 1. Database events table
   * 2. .flock/logs/{runId}.jsonl (append-only log file)
   *
   * @param runId - Run ID
   * @param type - Event type
   * @param payload - Event payload
   */
  async logEvent(
    runId: string,
    type: AgentEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    // Create event
    const event: Event = {
      id: eventId,
      run_id: runId,
      type,
      payload,
      created_at: timestamp,
    };

    // Insert into database
    const newDbEvent: NewDbEvent = {
      id: eventId,
      run_id: runId,
      type,
      payload_json: JSON.stringify(payload),
      created_at: timestamp,
    };

    await this.db.db.insert(this.db.schema.events).values(newDbEvent);

    // Append to log file
    const logDir = join(this.basePath, '.flock', 'logs');
    await mkdir(logDir, { recursive: true });
    const logPath = join(logDir, `${runId}.jsonl`);

    const logLine = JSON.stringify(event) + '\n';
    await appendFile(logPath, logLine);
  }

  /**
   * Get all events for a run.
   *
   * @param runId - Run ID
   * @returns Array of events
   */
  async getEvents(runId: string): Promise<Event[]> {
    const dbEvents = await this.db.db
      .select()
      .from(this.db.schema.events)
      .where(eq(this.db.schema.events.run_id, runId))
      .orderBy(desc(this.db.schema.events.created_at))
      .all();

    return dbEvents.map((dbEvent) => ({
      id: dbEvent.id,
      run_id: dbEvent.run_id,
      type: dbEvent.type as AgentEventType,
      payload: JSON.parse(dbEvent.payload_json) as Record<string, unknown>,
      created_at: dbEvent.created_at,
    }));
  }

  /**
   * Get the complete timeline for a task.
   *
   * Returns:
   * - All runs for the task
   * - Events for each run
   * - Gate results for each run
   * - Diff summaries
   * - All reviews
   *
   * @param taskId - Task ID
   * @returns Complete task timeline
   */
  async getRunTimeline(taskId: string): Promise<Result<RunTimeline, FlockError>> {
    try {
      // Get all runs for this task
      const dbRuns = await this.db.db
        .select()
        .from(this.db.schema.runs)
        .where(eq(this.db.schema.runs.task_id, taskId))
        .orderBy(desc(this.db.schema.runs.started_at))
        .all();

      // Get all events for these runs
      const runs: TimelineEntry[] = [];

      for (const dbRun of dbRuns) {
        // Get events for this run
        const dbEvents = await this.db.db
          .select()
          .from(this.db.schema.events)
          .where(eq(this.db.schema.events.run_id, dbRun.id))
          .orderBy(desc(this.db.schema.events.created_at))
          .all();

        const events: Event[] = dbEvents.map((dbEvent) => ({
          id: dbEvent.id,
          run_id: dbEvent.run_id,
          type: dbEvent.type as AgentEventType,
          payload: JSON.parse(dbEvent.payload_json) as Record<string, unknown>,
          created_at: dbEvent.created_at,
        }));

        // Get gate results
        const dbGates = await this.db.db
          .select()
          .from(this.db.schema.gates)
          .where(eq(this.db.schema.gates.task_id, taskId))
          .all();

        const gateResults: GateResult[] = dbGates.map((dbGate) => ({
          gate: dbGate.name,
          status: dbGate.status === 'passed' ? 'passed' : dbGate.status === 'failed' ? 'failed' : 'skipped',
          exitCode: 0, // Not stored in DB
          summary: '',
          logPath: dbGate.output_path || '',
          duration_ms: 0, // Not stored in DB
        }));

        runs.push({
          run: {
            id: dbRun.id,
            task_id: dbRun.task_id,
            agent_id: dbRun.agent_id,
            workspace_path: dbRun.workspace_path,
            branch_name: dbRun.branch_name,
            status: dbRun.status as Run['status'],
            started_at: dbRun.started_at,
            ended_at: dbRun.ended_at || undefined,
            exit_code: dbRun.exit_code || undefined,
          },
          events,
          gateResults,
        });
      }

      // Get all reviews for this task
      const dbReviews = await this.db.db
        .select()
        .from(this.db.schema.reviews)
        .where(eq(this.db.schema.reviews.task_id, taskId))
        .orderBy(desc(this.db.schema.reviews.created_at))
        .all();

      const reviews: Review[] = dbReviews.map((dbReview) => ({
        id: dbReview.id,
        task_id: dbReview.task_id,
        reviewer: dbReview.reviewer,
        verdict: dbReview.verdict as Review['verdict'],
        comment: dbReview.comment,
        created_at: dbReview.created_at,
      }));

      return ok({
        taskId,
        runs,
        reviews,
      });
    } catch (error) {
      return err(
        new FlockErrorClass(
          'DATABASE_ERROR',
          `Failed to get timeline: ${error instanceof Error ? error.message : String(error)}`,
          { taskId, error }
        )
      );
    }
  }

  /**
   * Read events from the log file for a run.
   *
   * This reads from the .flock/logs/{runId}.jsonl file
   * and returns all events as an array.
   *
   * @param runId - Run ID
   * @returns Array of events from log file
   */
  async getEventsFromFile(runId: string): Promise<Event[]> {
    const logPath = join(this.basePath, '.flock', 'logs', `${runId}.jsonl`);

    if (!existsSync(logPath)) {
      return [];
    }

    const content = await readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    return lines.map((line) => {
      try {
        return JSON.parse(line) as Event;
      } catch {
        return null;
      }
    }).filter((e): e is Event => e !== null);
  }

  /**
   * Tail the log file for a run (for live streaming).
   *
   * Returns an async iterable that yields new events as they arrive.
   *
   * @param runId - Run ID
   * @returns Async iterable of events
   */
  async *tailEvents(runId: string): AsyncIterable<Event> {
    const logPath = join(this.basePath, '.flock', 'logs', `${runId}.jsonl`);

    if (!existsSync(logPath)) {
      return;
    }

    let lastPosition = 0;

    while (true) {
      if (!existsSync(logPath)) {
        break;
      }

      const content = await readFile(logPath, 'utf-8');
      if (content.length > lastPosition) {
        const newContent = content.slice(lastPosition);
        const lines = newContent.trim().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const event = JSON.parse(line) as Event;
            yield event;
          } catch {
            // Skip malformed lines
          }
        }

        lastPosition = content.length;
      }

      // Check if run is complete
      const run = await this.db.db
        .select()
        .from(this.db.schema.runs)
        .where(eq(this.db.schema.runs.id, runId))
        .get();

      if (run && (run.status === 'SUCCEEDED' || run.status === 'FAILED' || run.status === 'CANCELLED')) {
        // Read any remaining content and exit
        const finalContent = await readFile(logPath, 'utf-8');
        if (finalContent.length > lastPosition) {
          const newContent = finalContent.slice(lastPosition);
          const lines = newContent.trim().split('\n').filter(Boolean);

          for (const line of lines) {
            try {
              const event = JSON.parse(line) as Event;
              yield event;
            } catch {
              // Skip malformed lines
            }
          }
        }
        break;
      }

      // Wait before checking again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/**
 * Factory function to create an event logger.
 */
export function createEventLogger(db: FlockDatabase, basePath: string): FlockEventLogger {
  return new FlockEventLogger(db, basePath);
}
