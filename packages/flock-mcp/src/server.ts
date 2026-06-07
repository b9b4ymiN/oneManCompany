/**
 * Flock MCP Server
 *
 * Main MCP server implementation for Flock agent control tower.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { FlockDatabase } from '@onemancompany/flock-kernel';
import type { FlockMCPServerConfig } from './types';
import { toMCPResult } from './types';

// Import tool functions and schemas
import {
  flockProjectList,
  flockProjectListSchema,
  TOOL_NAME_PROJECT_LIST,
  TOOL_DESC_PROJECT_LIST,
  flockProjectCreate,
  flockProjectCreateSchema,
  TOOL_NAME_PROJECT_CREATE,
  TOOL_DESC_PROJECT_CREATE,
  flockProjectStatus,
  flockProjectStatusSchema,
  TOOL_NAME_PROJECT_STATUS,
  TOOL_DESC_PROJECT_STATUS,
} from './tools/projects.js';
import {
  flockTaskCreate,
  flockTaskCreateSchema,
  TOOL_NAME_TASK_CREATE,
  TOOL_DESC_TASK_CREATE,
  flockTaskList,
  flockTaskListSchema,
  TOOL_NAME_TASK_LIST,
  TOOL_DESC_TASK_LIST,
  flockTaskStatus,
  flockTaskStatusSchema,
  TOOL_NAME_TASK_STATUS,
  TOOL_DESC_TASK_STATUS,
  flockTaskUpdate,
  flockTaskUpdateSchema,
  TOOL_NAME_TASK_UPDATE,
  TOOL_DESC_TASK_UPDATE,
  flockTaskDepsAdd,
  flockTaskDepsAddSchema,
  TOOL_NAME_TASK_DEPS_ADD,
  TOOL_DESC_TASK_DEPS_ADD,
  flockTaskDepsRemove,
  flockTaskDepsRemoveSchema,
  TOOL_NAME_TASK_DEPS_REMOVE,
  TOOL_DESC_TASK_DEPS_REMOVE,
} from './tools/tasks.js';
import {
  flockResearch,
  flockResearchSchema,
  TOOL_NAME_RESEARCH,
  TOOL_DESC_RESEARCH,
} from './tools/research.js';
import {
  flockCompileReport,
  flockCompileReportSchema,
  TOOL_NAME_COMPILE_REPORT,
  TOOL_DESC_COMPILE_REPORT,
} from './tools/report.js';
import {
  flockRunExecute,
  flockRunExecuteSchema,
  TOOL_NAME_RUN_EXECUTE,
  TOOL_DESC_RUN_EXECUTE,
  flockTaskOutput,
  flockTaskOutputSchema,
  TOOL_NAME_TASK_OUTPUT,
  TOOL_DESC_TASK_OUTPUT,
} from './tools/execution.js';

// ============================================================================
// FlockMCPServer Class
// ============================================================================

/**
 * Flock MCP Server
 *
 * Provides MCP tools for interacting with the Flock agent control tower.
 */
export class FlockMCPServer {
  private readonly server: McpServer;
  private readonly db: FlockDatabase;
  private readonly config: Required<FlockMCPServerConfig>;

  constructor(db: FlockDatabase, config: FlockMCPServerConfig = { version: '0.1.0' }) {
    this.db = db;
    this.config = {
      name: config.name ?? 'flock',
      version: config.version,
      debug: config.debug ?? false,
    };

    this.server = new McpServer(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }

  /**
   * Register all Flock tools with the MCP server
   */
  async registerTools(): Promise<void> {
    // Project tools
    this.server.tool(
      TOOL_NAME_PROJECT_LIST,
      TOOL_DESC_PROJECT_LIST,
      flockProjectListSchema.shape,
      async () => toMCPResult(await flockProjectList(this.db))
    );

    this.server.tool(
      TOOL_NAME_PROJECT_CREATE,
      TOOL_DESC_PROJECT_CREATE,
      flockProjectCreateSchema.shape,
      async (_, args) => toMCPResult(await flockProjectCreate(this.db, args as any))
    );

    this.server.tool(
      TOOL_NAME_PROJECT_STATUS,
      TOOL_DESC_PROJECT_STATUS,
      flockProjectStatusSchema.shape,
      async (_, args) => toMCPResult(await flockProjectStatus(this.db, args as any))
    );

    // Task tools
    this.server.tool(
      TOOL_NAME_TASK_CREATE,
      TOOL_DESC_TASK_CREATE,
      flockTaskCreateSchema.shape,
      async (_, args) => toMCPResult(await flockTaskCreate(this.db, args as any))
    );

    this.server.tool(
      TOOL_NAME_TASK_LIST,
      TOOL_DESC_TASK_LIST,
      flockTaskListSchema.shape,
      async (_, args) => toMCPResult(await flockTaskList(this.db, args as any))
    );

    this.server.tool(
      TOOL_NAME_TASK_STATUS,
      TOOL_DESC_TASK_STATUS,
      flockTaskStatusSchema.shape,
      async (_, args) => toMCPResult(await flockTaskStatus(this.db, args as any))
    );

    this.server.tool(
      TOOL_NAME_TASK_UPDATE,
      TOOL_DESC_TASK_UPDATE,
      flockTaskUpdateSchema.shape,
      async (_, args) => toMCPResult(await flockTaskUpdate(this.db, args as any))
    );

    this.server.tool(
      TOOL_NAME_TASK_DEPS_ADD,
      TOOL_DESC_TASK_DEPS_ADD,
      flockTaskDepsAddSchema.shape,
      async (_, args) => toMCPResult(await flockTaskDepsAdd(this.db, args as any))
    );

    this.server.tool(
      TOOL_NAME_TASK_DEPS_REMOVE,
      TOOL_DESC_TASK_DEPS_REMOVE,
      flockTaskDepsRemoveSchema.shape,
      async (_, args) => toMCPResult(await flockTaskDepsRemove(this.db, args as any))
    );

    // Research tool
    this.server.tool(
      TOOL_NAME_RESEARCH,
      TOOL_DESC_RESEARCH,
      flockResearchSchema.shape,
      async (_, args) => toMCPResult(await flockResearch(this.db, args as any))
    );

    // Report compilation tool
    this.server.tool(
      TOOL_NAME_COMPILE_REPORT,
      TOOL_DESC_COMPILE_REPORT,
      flockCompileReportSchema.shape,
      async (_, args) => toMCPResult(await flockCompileReport(this.db, args as any))
    );

    // Run execution tool
    this.server.tool(
      TOOL_NAME_RUN_EXECUTE,
      TOOL_DESC_RUN_EXECUTE,
      flockRunExecuteSchema.shape,
      async (_, args) => toMCPResult(await flockRunExecute(this.db, args as any))
    );

    // Task output retrieval tool
    this.server.tool(
      TOOL_NAME_TASK_OUTPUT,
      TOOL_DESC_TASK_OUTPUT,
      flockTaskOutputSchema.shape,
      async (_, args) => toMCPResult(await flockTaskOutput(this.db, args as any))
    );
  }

  /**
   * Connect the server using a stdio transport
   */
  async connect(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  /**
   * Get the underlying MCP server instance
   */
  getServer(): McpServer {
    return this.server;
  }

  /**
   * Close the server connection
   */
  async close(): Promise<void> {
    await this.server.close();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and configure a Flock MCP server
 *
 * @param db - Flock database instance
 * @param config - Server configuration
 * @returns Configured FlockMCPServer instance
 */
export async function createFlockMCPServer(
  db: FlockDatabase,
  config?: FlockMCPServerConfig
): Promise<FlockMCPServer> {
  const server = new FlockMCPServer(db, config);
  await server.registerTools();
  return server;
}
