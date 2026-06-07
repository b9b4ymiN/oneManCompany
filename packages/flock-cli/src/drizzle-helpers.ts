/**
 * Drizzle ORM type-safe query helpers.
 *
 * Wraps Drizzle query operations to avoid type incompatibilities
 * between the schema column types and the query builder overloads.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Type-safe eq() wrapper that avoids Drizzle overload mismatches.
 */
export function safeEq(table: any, column: string, value: any): any {
  const { eq } = require('drizzle-orm') as typeof import('drizzle-orm');
  return eq(table[column], value);
}

/**
 * Type-safe desc() wrapper.
 */
export function safeDesc(table: any, column: string): any {
  const { desc } = require('drizzle-orm') as typeof import('drizzle-orm');
  return desc(table[column]);
}
