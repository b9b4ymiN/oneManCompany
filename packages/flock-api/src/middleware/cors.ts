/**
 * CORS Middleware
 *
 * Enable CORS for local development.
 */

import type { Context, Next, MiddlewareHandler } from 'hono';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
} as const;

/**
 * CORS middleware.
 *
 * Adds CORS headers to all responses for local development.
 */
export const cors = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    await next();

    // Add CORS headers to response
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      c.header(key, value);
    }
  };
};
