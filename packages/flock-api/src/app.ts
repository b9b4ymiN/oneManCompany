/**
 * Flock API Application
 *
 * Hono-based REST API with SSE for the Flock control tower.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { errorHandler } from './middleware/error-handler';
import { cors } from './middleware/cors';
import { projects } from './routes/projects';
import { tasks } from './routes/tasks';
import { runs } from './routes/runs';
import { gates } from './routes/gates';
import { reviews } from './routes/reviews';
import { diff } from './routes/diff';
import { events } from './routes/events';
import type { FlockDatabase } from '@onemancompany/flock-kernel';

// ============================================================================
// Types
// ============================================================================

export interface AppContext {
  db: FlockDatabase;
  basePath: string;
}

// ============================================================================
// App Factory
// ============================================================================

/**
 * Create and configure the Flock API application.
 *
 * @param db - Flock database instance
 * @param basePath - Base path for the project (for log files, etc.)
 * @returns Configured Hono application
 */
export function createApp(db: FlockDatabase, basePath: string = process.cwd()): Hono<{
  Variables: AppContext;
}> {
  // Create app with context variables type
  const app = new Hono<{
    Variables: AppContext;
  }>();

  // Set up shared context using middleware
  app.use('/*', async (c, next) => {
    c.set('db', db);
    c.set('basePath', basePath);
    await next();
  });

  // Apply middleware
  app.use('/*', errorHandler);
  app.use('/*', cors());

  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    });
  });

  // API routes - mount individual route modules
  // Note: Type cast is needed due to Hono's type inference complexity
  app.route('/api/projects', projects as unknown as Hono);
  app.route('/api/tasks', tasks as unknown as Hono);
  app.route('/api/runs', runs as unknown as Hono);
  app.route('/api/gates', gates as unknown as Hono);
  app.route('/api/reviews', reviews as unknown as Hono);
  app.route('/api/diff', diff as unknown as Hono);
  app.route('/api/events', events as unknown as Hono);

  return app;
}

// ============================================================================
// Server Starter
// ============================================================================

export interface ServerOptions {
  port?: number;
  hostname?: string;
  db: FlockDatabase;
  basePath?: string;
}

/**
 * Start the Flock API server.
 *
 * @param options - Server configuration options
 * @returns The server instance
 */
export function startServer(options: ServerOptions): ReturnType<typeof serve> {
  const {
    port = parseInt(process.env.FLOCK_API_PORT || '3100', 10),
    hostname = process.env.FLOCK_API_HOST || 'localhost',
    db,
    basePath = process.cwd(),
  } = options;

  const app = createApp(db, basePath);

  const server = serve({
    fetch: app.fetch,
    port,
    hostname,
  });

  console.log(`🚀 Flock API server running at http://${hostname}:${port}`);
  console.log(`📡 Health check: http://${hostname}:${port}/health`);
  console.log(`🔌 API base: http://${hostname}:${port}/api`);

  return server;
}
