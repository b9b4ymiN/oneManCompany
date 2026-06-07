/**
 * Run Execution MCP Tool
 *
 * Executes a task run: stores input, marks running, records output, completes.
 */

import type { FlockDatabase } from '@onemancompany/flock-kernel';
import { runs, events, tasks } from '@onemancompany/flock-kernel';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { toMCPResult, ToolSuccess, ToolError } from '../types.js';

// ============================================================================
// flock_run_execute
// ============================================================================

export const TOOL_NAME_RUN_EXECUTE = 'flock_run_execute';
export const TOOL_DESC_RUN_EXECUTE = 'Execute a task run: record output data and mark the run as completed. Use this to store work results from any agent.';

export const flockRunExecuteSchema = z.object({
  taskId: z.string().describe('Task ID to execute a run for'),
  agentId: z.string().optional().default('analyst').describe('Agent performing the work'),
  output: z.any().describe('The output/result data to store'),
  outputType: z.string().optional().describe('Type of output (e.g., "analysis", "research", "report")'),
  summary: z.string().optional().describe('Brief summary of what was done'),
  status: z.enum(['COMPLETED', 'FAILED']).optional().default('COMPLETED').describe('Run status'),
});

export async function flockRunExecute(
  db: FlockDatabase,
  args: z.infer<typeof flockRunExecuteSchema>
): Promise<ToolSuccess | ToolError> {
  const { taskId, agentId, output, outputType, summary, status } = args;

  try {
    // Verify task exists
    const task = await db.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .get();

    if (!task) {
      return { success: false, error: `Task not found: ${taskId}`, code: 'NOT_FOUND' };
    }

    const now = new Date().toISOString();
    const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;

    // Create run record
    await (db.db.insert(runs).values as any)({
      id: runId,
      task_id: taskId,
      agent_id: agentId || 'analyst',
      workspace_path: '',
      branch_name: '',
      status: status || 'COMPLETED',
      started_at: now,
      ended_at: now,
      exit_code: status === 'FAILED' ? 1 : 0,
    });

    // Store output as event
    const eventId = randomUUID();
    await (db.db.insert(events).values as any)({
      id: eventId,
      run_id: runId,
      type: outputType || 'task_output',
      payload_json: JSON.stringify({
        taskId,
        agentId: agentId || 'analyst',
        output,
        summary: summary || `Executed task: ${task.title}`,
        timestamp: now,
      }),
      created_at: now,
    });

    // Update task status
    const newTaskStatus = status === 'COMPLETED' ? 'GATES_PASSED' : 'FAILED';
    await db.db
      .update(tasks)
      .set({ status: newTaskStatus, updated_at: now })
      .where(eq(tasks.id, taskId));

    return {
      success: true,
      data: {
        runId,
        taskId,
        status: status || 'COMPLETED',
        taskStatus: newTaskStatus,
        eventId,
        summary: summary || `Executed task: ${task.title}`,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Run execution failed',
      code: 'EXECUTION_ERROR',
    };
  }
}

// ============================================================================
// flock_task_output
// ============================================================================

export const TOOL_NAME_TASK_OUTPUT = 'flock_task_output';
export const TOOL_DESC_TASK_OUTPUT = 'Get all stored outputs/results for a task. Returns all run outputs from events.';

export const flockTaskOutputSchema = z.object({
  taskId: z.string().describe('Task ID to get outputs for'),
});

export async function flockTaskOutput(
  db: FlockDatabase,
  args: z.infer<typeof flockTaskOutputSchema>
): Promise<ToolSuccess | ToolError> {
  const { taskId } = args;

  try {
    // Get all runs for the task
    const taskRuns = await db.db
      .select()
      .from(runs)
      .where(eq(runs.task_id, taskId))
      .all();

    const outputs: Array<{ runId: string; status: string; events: any[] }> = [];

    for (const run of taskRuns) {
      // Get all events for this run
      const runEvents = await db.db
        .select()
        .from(events)
        .where(eq(events.run_id, run.id))
        .all();

      outputs.push({
        runId: run.id,
        status: run.status,
        events: runEvents.map((e) => ({
          id: e.id,
          type: e.type,
          payload: JSON.parse(e.payload_json),
          createdAt: e.created_at,
        })),
      });
    }

    return {
      success: true,
      data: {
        taskId,
        runCount: outputs.length,
        outputs,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to get task output',
      code: 'OUTPUT_ERROR',
    };
  }
}
