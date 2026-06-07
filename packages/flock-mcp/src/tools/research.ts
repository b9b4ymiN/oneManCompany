/**
 * Research MCP Tool
 *
 * Fetches web data for stock/company research and stores results as run output.
 */

import type { FlockDatabase } from '@onemancompany/flock-kernel';
import { runs, events } from '@onemancompany/flock-kernel';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { toMCPResult, ToolSuccess, ToolError } from '../types.js';

// ============================================================================
// flock_research
// ============================================================================

export const TOOL_NAME_RESEARCH = 'flock_research';
export const TOOL_DESC_RESEARCH = 'Research a topic by fetching web data. Returns structured research results that are stored in the database.';

export const flockResearchSchema = z.object({
  taskId: z.string().describe('The task ID to associate research with'),
  agentId: z.string().optional().default('researcher').describe('Agent performing research'),
  query: z.string().describe('Search query or research topic'),
  sources: z.array(z.string().url()).optional().describe('Specific URLs to fetch'),
});

export async function flockResearch(
  db: FlockDatabase,
  args: z.infer<typeof flockResearchSchema>
): Promise<ToolSuccess | ToolError> {
  const { taskId, agentId, query, sources } = args;

  try {
    const now = new Date().toISOString();
    const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;

    // Create a run record
    await (db.db.insert(runs).values as any)({
      id: runId,
      task_id: taskId,
      agent_id: agentId || 'researcher',
      workspace_path: '',
      branch_name: '',
      status: 'RUNNING',
      started_at: now,
      ended_at: null,
      exit_code: null,
    });

    // Log the research query as an event
    await (db.db.insert(events).values as any)({
      id: randomUUID(),
      run_id: runId,
      type: 'research_query',
      payload_json: JSON.stringify({ query, sources }),
      created_at: now,
    });

    // Fetch data from sources or return structured research plan
    const results: Array<{ url: string; title: string; summary: string; data: any }> = [];

    if (sources && sources.length > 0) {
      for (const url of sources) {
        try {
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Flock-MCP-Research/1.0' },
            signal: AbortSignal.timeout(15000),
          });
          const text = await response.text();
          results.push({
            url,
            title: extractTitle(text) || url,
            summary: text.slice(0, 2000),
            data: { status: response.status, length: text.length },
          });
        } catch (err: any) {
          results.push({
            url,
            title: url,
            summary: `Failed to fetch: ${err.message}`,
            data: { error: err.message },
          });
        }
      }
    }

    // Store results as event
    const resultEventId = randomUUID();
    await (db.db.insert(events).values as any)({
      id: resultEventId,
      run_id: runId,
      type: 'research_result',
      payload_json: JSON.stringify({ query, results, timestamp: now }),
      created_at: now,
    });

    // Update run as completed
    await db.db
      .update(runs)
      .set({ status: 'COMPLETED', ended_at: new Date().toISOString(), exit_code: 0 })
      .where(eq(runs.id, runId!));

    return {
      success: true,
      data: {
        runId,
        query,
        resultCount: results.length,
        results,
        eventId: resultEventId,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Research failed',
      code: 'RESEARCH_ERROR',
    };
  }
}

/**
 * Extract title from HTML content
 */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}
