/**
 * MCP Server Types
 *
 * Type definitions for the Flock MCP server.
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// Tool Result Types
// ============================================================================

/**
 * Standard success response format for MCP tools
 */
export interface ToolSuccess {
  success: true;
  data: unknown;
}

/**
 * Standard error response format for MCP tools
 */
export interface ToolError {
  success: false;
  error: string;
  code?: string;
}

/**
 * Union type for tool results
 */
export type ToolResult = ToolSuccess | ToolError;

/**
 * Convert a ToolResult to MCP CallToolResult format
 */
export function toMCPResult(result: ToolResult): CallToolResult {
  if (result.success) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: result.error, code: result.code }, null, 2),
      },
    ],
    isError: true,
  };
}

// ============================================================================
// MCP-specific Types
// ============================================================================

/**
 * Flock MCP server configuration
 */
export interface FlockMCPServerConfig {
  /**
   * Server name (default: "flock")
   */
  name?: string;

  /**
   * Server version
   */
  version: string;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}
