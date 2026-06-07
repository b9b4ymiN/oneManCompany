/**
 * Error Handler Middleware
 *
 * Global error handling for the API.
 */

import type { Context, Next } from 'hono';

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Error handler middleware.
 *
 * Catches all errors and returns consistent JSON error responses.
 */
export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    console.error('API Error:', error);

    // Handle known error types
    if (error instanceof Error) {
      // Check for FlockError (from flock-kernel)
      if ('code' in error) {
        const apiError: ApiError = {
          error: error.message,
          code: String((error as { code: string }).code),
        };
        if ('details' in error) {
          apiError.details = (error as { details: unknown }).details;
        }
        return c.json(apiError, 400);
      }

      // Generic error
      const apiError: ApiError = {
        error: error.message,
        code: 'INTERNAL_ERROR',
      };
      return c.json(apiError, 500);
    }

    // Unknown error type
    const apiError: ApiError = {
      error: 'An unknown error occurred',
      code: 'UNKNOWN_ERROR',
    };
    return c.json(apiError, 500);
  }
}
