/**
 * Flock Database Client
 *
 * Initializes Drizzle ORM with better-sqlite3.
 * DB path defaults to `.flock/flock.db` relative to project root.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Database client interface.
 */
export interface FlockDatabase {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
  schema: typeof schema;
}

/**
 * Creates and initializes the Flock database client.
 *
 * @param dbPath - Optional custom path to the database file.
 *                 Defaults to `.flock/flock.db` in the current working directory.
 * @returns Flock database instance with schema
 */
export function createDatabase(dbPath?: string): FlockDatabase {
  const defaultDbPath = path.join(process.cwd(), '.flock', 'flock.db');
  const finalDbPath = dbPath ?? defaultDbPath;

  // Ensure the directory exists
  const dbDir = path.dirname(finalDbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = new Database(finalDbPath);

  // Enable WAL mode for better concurrency
  sqlite.pragma('journal_mode = WAL');

  const db = drizzle(sqlite, { schema });

  return { db, sqlite, schema };
}

/**
 * Global database instance.
 * Can be lazily initialized when needed.
 */
let globalDb: ReturnType<typeof createDatabase> | null = null;

/**
 * Get or create the global database instance.
 *
 * @param dbPath - Optional custom path (only used on first call)
 * @returns Drizzle database instance
 */
export function getDatabase(dbPath?: string) {
  if (!globalDb) {
    globalDb = createDatabase(dbPath);
  }
  return globalDb.db;
}

/**
 * Close the global database connection.
 */
export function closeDatabase() {
  if (globalDb) {
    globalDb.sqlite.close();
    globalDb = null;
  }
}

// Re-export schema for convenience
export { schema };
export * from './schema';
