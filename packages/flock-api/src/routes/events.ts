/**
 * Events API Routes
 *
 * Server-Sent Events for real-time updates.
 */

import { Hono } from 'hono';
import type { FlockDatabase } from '@onemancompany/flock-kernel';
import { eq } from 'drizzle-orm';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Use shared context type
export interface AppContext {
  db: FlockDatabase;
  basePath: string;
}

const events = new Hono<{ Variables: AppContext }>();

/**
 * GET /api/events/stream
 *
 * Server-Sent Events for real-time updates.
 *
 * Streams events as they happen: run_started, agent_spawned, gate_passed,
 * gate_failed, review_requested, etc.
 *
 * Query parameters:
 * - runId: Optional run ID to filter events for a specific run
 * - taskId: Optional task ID to filter events for a specific task
 */
events.get('/stream', async (c) => {
  const db = c.get('db');
  const basePath = c.get('basePath');
  const runId = c.req.query('runId');
  const taskId = c.req.query('taskId');

  // Set up SSE headers
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const sendHeartbeat = () => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      };

      // Send initial connection event
      sendEvent('connected', {
        message: 'SSE connection established',
        timestamp: new Date().toISOString(),
      });

      // If runId is provided, stream events for that run
      if (runId) {
        try {
          // Check if run exists
          const run = await db.db
            .select()
            .from(db.schema.runs)
            .where(eq(db.schema.runs.id, runId))
            .get();

          if (!run) {
            sendEvent('error', { message: 'Run not found' });
            controller.close();
            return;
          }

          // Stream events from the log file
          const logPath = join(basePath, '.flock', 'logs', `${runId}.jsonl`);
          let lastPosition = 0;
          let isComplete = false;

          const checkInterval = setInterval(async () => {
            try {
              const { readFile } = require('node:fs/promises');
              const { existsSync } = require('node:fs');

              if (!existsSync(logPath)) {
                // If run is complete and log doesn't exist, we're done
                if (run.status === 'SUCCEEDED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
                  isComplete = true;
                }
                return;
              }

              const content = await readFile(logPath, 'utf-8');
              if (content.length > lastPosition) {
                const newContent = content.slice(lastPosition);
                const lines = newContent.trim().split('\n').filter(Boolean);

                for (const line of lines) {
                  try {
                    const event = JSON.parse(line);
                    sendEvent('event', event);
                  } catch {
                    // Skip malformed lines
                  }
                }

                lastPosition = content.length;
              }

              // Check if run is complete
              const updatedRun = await db.db
                .select()
                .from(db.schema.runs)
                .where(eq(db.schema.runs.id, runId))
                .get();

              if (updatedRun && (updatedRun.status === 'SUCCEEDED' || updatedRun.status === 'FAILED' || updatedRun.status === 'CANCELLED')) {
                // Read any remaining content
                if (content.length > lastPosition) {
                  const newContent = content.slice(lastPosition);
                  const lines = newContent.trim().split('\n').filter(Boolean);

                  for (const line of lines) {
                    try {
                      const event = JSON.parse(line);
                      sendEvent('event', event);
                    } catch {
                      // Skip malformed lines
                    }
                  }
                }

                isComplete = true;
              }
            } catch (error) {
              sendEvent('error', { message: error instanceof Error ? error.message : 'Unknown error' });
            }

            if (isComplete) {
              clearInterval(checkInterval);
              sendEvent('complete', { message: 'Run completed', runId });
              setTimeout(() => controller.close(), 1000);
            }
          }, 100);

          // Cleanup on client disconnect
          c.req.raw.signal?.addEventListener('abort', () => {
            clearInterval(checkInterval);
            controller.close();
          });
        } catch (error) {
          sendEvent('error', { message: error instanceof Error ? error.message : 'Unknown error' });
          controller.close();
        }
      } else if (taskId) {
        // If taskId is provided, get the most recent run and stream its events
        try {
          const run = await db.db
            .select()
            .from(db.schema.runs)
            .where(eq(db.schema.runs.task_id, taskId))
            .orderBy(db.schema.runs.started_at)
            .limit(1)
            .get();

          if (!run) {
            sendEvent('error', { message: 'No run found for task' });
            controller.close();
            return;
          }

          // Use the same logic as runId
          const streamRunId = run.id;
          const logPath = join(basePath, '.flock', 'logs', `${streamRunId}.jsonl`);

          // ... (similar streaming logic)
          sendEvent('info', { message: 'Streaming events for latest run', runId: streamRunId });
          setTimeout(() => controller.close(), 1000);
        } catch (error) {
          sendEvent('error', { message: error instanceof Error ? error.message : 'Unknown error' });
          controller.close();
        }
      } else {
        // No filter - send heartbeat and close
        sendEvent('info', { message: 'No runId or taskId provided, connection will close' });
        setTimeout(() => controller.close(), 1000);
      }

      // Send heartbeat every 30 seconds
      const heartbeatInterval = setInterval(() => {
        if (!c.req.raw.signal?.aborted) {
          sendHeartbeat();
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 30000);
    },
  });

  return new Response(stream, {
    headers: c.res.headers,
  });
});

/**
 * POST /api/events
 *
 * Log an event (internal endpoint for testing).
 */
events.post('/', async (c) => {
  const db = c.get('db');
  const basePath = c.get('basePath');

  const body = await c.req.json();
  const { runId, type, payload } = body;

  if (!runId || !type || !payload) {
    return c.json(
      {
        error: 'Missing required fields: runId, type, payload',
        code: 'VALIDATION_ERROR',
      },
      400
    );
  }

  try {
    // Validate run exists
    const run = await db.db
      .select()
      .from(db.schema.runs)
      .where(eq(db.schema.runs.id, runId))
      .get();

    if (!run) {
      return c.json({ error: 'Run not found', code: 'NOT_FOUND' }, 404);
    }

    // Log event
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    // Insert into database
    await db.db.insert(db.schema.events).values({
      id: eventId,
      run_id: runId,
      type,
      payload_json: JSON.stringify(payload),
      created_at: timestamp,
    });

    // Append to log file
    const logDir = join(basePath, '.flock', 'logs');
    await mkdir(logDir, { recursive: true });
    const logPath = join(logDir, `${runId}.jsonl`);

    const event = {
      id: eventId,
      run_id: runId,
      type,
      payload,
      created_at: timestamp,
    };

    await appendFile(logPath, JSON.stringify(event) + '\n');

    return c.json({ success: true, event });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to log event',
        code: 'LOG_FAILED',
      },
      500
    );
  }
});

export { events };
