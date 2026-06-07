/**
 * Projects API Routes
 *
 * Endpoints for managing projects.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { FlockDatabase, Project } from '@onemancompany/flock-kernel';
import { eq } from 'drizzle-orm';

// Use shared context type
export interface AppContext {
  db: FlockDatabase;
  basePath: string;
}

const projects = new Hono<{ Variables: AppContext }>();

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1),
  repo_path: z.string().min(1),
  default_branch: z.string().default('main'),
});

/**
 * GET /api/projects
 *
 * List all projects.
 */
projects.get('/', async (c) => {
  const db = c.get('db');

  const dbProjects = await db.db
    .select()
    .from(db.schema.projects)
    .orderBy(db.schema.projects.created_at)
    .all();

  const projects: Project[] = dbProjects.map((p) => ({
    id: p.id,
    name: p.name,
    repo_path: p.repo_path,
    default_branch: p.default_branch,
    created_at: p.created_at,
  }));

  return c.json({ projects });
});

/**
 * GET /api/projects/:id
 *
 * Get project detail.
 */
projects.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const project = await db.db
    .select()
    .from(db.schema.projects)
    .where(eq(db.schema.projects.id, id))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);
  }

  return c.json({
    project: {
      id: project.id,
      name: project.name,
      repo_path: project.repo_path,
      default_branch: project.default_branch,
      created_at: project.created_at,
    },
  });
});

/**
 * POST /api/projects
 *
 * Register new project.
 */
projects.post('/', async (c) => {
  const db = c.get('db');

  const body = await c.req.json();
  const result = createProjectSchema.safeParse(body);

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
  const projectId = `proj-${Date.now()}`;

  try {
    await db.db.insert(db.schema.projects).values({
      id: projectId,
      name: data.name,
      repo_path: data.repo_path,
      default_branch: data.default_branch,
      created_at: now,
    });

    const project: Project = {
      id: projectId,
      name: data.name,
      repo_path: data.repo_path,
      default_branch: data.default_branch,
      created_at: now,
    };

    return c.json({ project }, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create project',
        code: 'CREATE_FAILED',
      },
      500
    );
  }
});

export { projects };
