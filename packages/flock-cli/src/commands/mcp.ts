/**
 * Flock MCP Command
 *
 * Starts the Flock MCP server on stdio for integration with Claude Code.
 */

import { createDatabase } from '@onemancompany/flock-kernel';
import { createFlockMCPServer } from '@onemancompany/flock-mcp';
import path from 'node:path';

/**
 * Start the MCP server.
 *
 * Resolves the DB path from .flock/flock.db, creates the database,
 * creates the MCP server, and connects stdio transport.
 *
 * Logs startup message to stderr (not stdout - that's for MCP protocol).
 */
export async function mcpCommand(): Promise<void> {
  // Resolve DB path from .flock/flock.db
  const dbPath = path.join(process.cwd(), '.flock', 'flock.db');

  // Log startup message to stderr
  console.error(`[flock] Starting MCP server...`);
  console.error(`[flock] Database: ${dbPath}`);

  try {
    // Create database
    const db = createDatabase(dbPath);
    console.error(`[flock] Database initialized`);

    // Create MCP server
    const server = await createFlockMCPServer(db, {
      name: 'flock',
      version: '0.1.0',
      debug: false,
    });
    console.error(`[flock] MCP server created`);

    // Connect stdio transport
    await server.connect();
    console.error(`[flock] MCP server connected and ready`);

    // Keep the process alive - MCP server handles stdio
    // The server will close when stdio ends
  } catch (error) {
    console.error(`[flock] Error starting MCP server: ${error}`);
    process.exit(1);
  }
}
