/**
 * Report Compiler MCP Tool
 *
 * Reads task outputs and generates a compiled report file.
 */

import type { FlockDatabase } from '@onemancompany/flock-kernel';
import { runs, events, tasks } from '@onemancompany/flock-kernel';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { toMCPResult, ToolSuccess, ToolError } from '../types.js';

// ============================================================================
// flock_compile_report
// ============================================================================

export const TOOL_NAME_COMPILE_REPORT = 'flock_compile_report';
export const TOOL_DESC_COMPILE_REPORT = 'Compile a report from task research results. Reads all completed research data for a project and generates a structured report file.';

export const flockCompileReportSchema = z.object({
  projectId: z.string().describe('Project ID to compile report for'),
  title: z.string().optional().describe('Report title'),
  format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format'),
  outputPath: z.string().optional().describe('Custom output file path'),
});

interface ResearchResult {
  query: string;
  results: Array<{ url: string; title: string; summary: string; data: any }>;
  timestamp: string;
}

export async function flockCompileReport(
  db: FlockDatabase,
  args: z.infer<typeof flockCompileReportSchema>
): Promise<ToolSuccess | ToolError> {
  const { projectId, title, format, outputPath } = args;

  try {
    // Get all tasks for the project
    const projectTasks = await db.db
      .select()
      .from(tasks)
      .where(eq(tasks.project_id, projectId))
      .all();

    if (projectTasks.length === 0) {
      return { success: false, error: 'No tasks found for project', code: 'NO_TASKS' };
    }

    // Collect all research results from all tasks
    const allResearch: Array<{ task: any; results: ResearchResult[] }> = [];

    for (const task of projectTasks) {
      // Get all runs for this task
      const taskRuns = await db.db
        .select()
        .from(runs)
        .where(eq(runs.task_id, task.id))
        .all();

      const taskResearch: ResearchResult[] = [];

      for (const run of taskRuns) {
        // Get research_result events for this run
        const researchEvents = await db.db
          .select()
          .from(events)
          .where(
            and(
              eq(events.run_id, run.id),
              eq(events.type, 'research_result'),
            )
          )
          .all();

        for (const event of researchEvents) {
          try {
            const payload = JSON.parse(event.payload_json) as ResearchResult;
            taskResearch.push(payload);
          } catch {
            // Skip malformed events
          }
        }
      }

      if (taskResearch.length > 0) {
        allResearch.push({ task, results: taskResearch });
      }
    }

    // Generate report
    const reportTitle = title || `Analysis Report - Project ${projectId}`;
    let reportContent: string;

    if (format === 'json') {
      reportContent = JSON.stringify({
        title: reportTitle,
        projectId,
        generatedAt: new Date().toISOString(),
        taskCount: projectTasks.length,
        researchTasks: allResearch.length,
        data: allResearch,
      }, null, 2);
    } else {
      reportContent = generateMarkdownReport(reportTitle, projectId, allResearch);
    }

    // Write report file
    const reportDir = resolve(process.cwd(), '.flock', 'reports');
    mkdirSync(reportDir, { recursive: true });
    const reportFileName = `report_${projectId}_${Date.now()}.${format === 'json' ? 'json' : 'md'}`;
    const reportPath = outputPath || join(reportDir, reportFileName);

    writeFileSync(reportPath, reportContent, 'utf-8');

    // Store report event
    const reportEventId = randomUUID();
    const now = new Date().toISOString();

    // Find first task to attach event to (or create a summary task)
    const firstTask = projectTasks[0]!;
    const taskRuns = await db.db
      .select()
      .from(runs)
      .where(eq(runs.task_id, firstTask.id))
      .all();

    if (taskRuns.length > 0) {
      await (db.db.insert(events).values as any)({
        id: reportEventId,
        run_id: taskRuns[0]!.id,
        type: 'report_compiled',
        payload_json: JSON.stringify({
          title: reportTitle,
          path: reportPath,
          format,
          taskCount: projectTasks.length,
          researchTasks: allResearch.length,
        }),
        created_at: now,
      });
    }

    return {
      success: true,
      data: {
        title: reportTitle,
        path: reportPath,
        format,
        taskCount: projectTasks.length,
        researchTasks: allResearch.length,
        totalResults: allResearch.reduce((sum, r) => sum + r.results.reduce((s, rr) => s + rr.results.length, 0), 0),
        eventId: reportEventId,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Report compilation failed',
      code: 'REPORT_ERROR',
    };
  }
}

/**
 * Generate a markdown report from research data
 */
function generateMarkdownReport(
  title: string,
  projectId: string,
  research: Array<{ task: any; results: ResearchResult[] }>
): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    `> Generated by Flock MCP — ${new Date().toISOString()}`,
    `> Project ID: ${projectId}`,
    '',
    '---',
    '',
  ];

  for (const { task, results } of research) {
    lines.push(`## ${task.title}`);
    if (task.description) {
      lines.push('', `*${task.description}*`);
    }
    lines.push('');

    for (const researchResult of results) {
      lines.push(`### Research: ${researchResult.query}`);
      lines.push(`*Queried at: ${researchResult.timestamp}*`);
      lines.push('');

      for (const result of researchResult.results) {
        lines.push(`#### [${result.title}](${result.url})`);
        if (result.data?.error) {
          lines.push(`⚠️ Error: ${result.data.error}`);
        } else {
          // Include summary (truncated for readability)
          const summary = result.summary.length > 1000
            ? result.summary.slice(0, 1000) + '...'
            : result.summary;
          lines.push(summary);
        }
        lines.push('');
      }
    }

    lines.push('---', '');
  }

  lines.push('', '*Report generated by Flock MCP — Multi-Agent Orchestration System*');

  return lines.join('\n');
}
