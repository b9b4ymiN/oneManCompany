/**
 * Reviews API Routes
 *
 * Endpoints for managing reviews.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { FlockDatabase, Review } from '@onemancompany/flock-kernel';
import { eq, desc } from 'drizzle-orm';

// Use shared context type
export interface AppContext {
  db: FlockDatabase;
  basePath: string;
}

const reviews = new Hono<{ Variables: AppContext }>();

// Validation schemas
const createReviewSchema = z.object({
  task_id: z.string().min(1),
  reviewer: z.string().min(1),
  verdict: z.enum(['APPROVE', 'REQUEST_CHANGES', 'ASK_ANOTHER_AGENT', 'REJECT']),
  comment: z.string().min(1),
});

/**
 * GET /api/reviews?taskId=
 *
 * List reviews for a task.
 */
reviews.get('/', async (c) => {
  const db = c.get('db');
  const taskId = c.req.query('taskId');

  if (!taskId) {
    return c.json({ error: 'taskId query parameter is required', code: 'VALIDATION_ERROR' }, 400);
  }

  const dbReviews = await db.db
    .select()
    .from(db.schema.reviews)
    .where(eq(db.schema.reviews.task_id, taskId))
    .orderBy(desc(db.schema.reviews.created_at))
    .all();

  const reviews: Review[] = dbReviews.map((r) => ({
    id: r.id,
    task_id: r.task_id,
    reviewer: r.reviewer,
    verdict: r.verdict as Review['verdict'],
    comment: r.comment,
    created_at: r.created_at,
  }));

  return c.json({ reviews });
});

/**
 * POST /api/reviews
 *
 * Submit a review.
 */
reviews.post('/', async (c) => {
  const db = c.get('db');

  const body = await c.req.json();
  const result = createReviewSchema.safeParse(body);

  if (!result.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: result.error.flatten(),
      },
      400
    );
  }

  const data = result.data;
  const now = new Date().toISOString();
  const reviewId = `review-${Date.now()}`;

  // Validate task exists
  const task = await db.db
    .select()
    .from(db.schema.tasks)
    .where(eq(db.schema.tasks.id, data.task_id))
    .get();

  if (!task) {
    return c.json({ error: 'Task not found', code: 'NOT_FOUND' }, 404);
  }

  try {
    // Create review
    await db.db.insert(db.schema.reviews).values({
      id: reviewId,
      task_id: data.task_id,
      reviewer: data.reviewer,
      verdict: data.verdict,
      comment: data.comment,
      created_at: now,
    });

    // Update task state based on verdict
    let newStatus = task.status;
    if (data.verdict === 'APPROVE') {
      newStatus = 'APPROVED';
    } else if (data.verdict === 'REJECT') {
      newStatus = 'REJECTED';
    } else if (data.verdict === 'REQUEST_CHANGES') {
      newStatus = 'READY'; // Can retry
    }

    if (newStatus !== task.status) {
      await db.db
        .update(db.schema.tasks)
        .set({ status: newStatus, updated_at: now })
        .where(eq(db.schema.tasks.id, data.task_id));
    }

    const review = await db.db
      .select()
      .from(db.schema.reviews)
      .where(eq(db.schema.reviews.id, reviewId))
      .get();

    if (!review) {
      return c.json({ error: 'Failed to create review', code: 'CREATE_FAILED' }, 500);
    }

    const response: Review = {
      id: review.id,
      task_id: review.task_id,
      reviewer: review.reviewer,
      verdict: review.verdict as Review['verdict'],
      comment: review.comment,
      created_at: review.created_at,
    };

    return c.json({ review: response }, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create review',
        code: 'CREATE_FAILED',
      },
      500
    );
  }
});

export { reviews };
