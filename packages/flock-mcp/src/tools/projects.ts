/**
 * Project MCP Tools
 *
 * MCP tools for managing Flock projects.
 */

import type { FlockDatabase } from '@onemancompany/flock-kernel';
import { projects } from '@onemancompany/flock-kernel';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { toMCPResult, ToolSuccess, ToolError } from '../types.js';

// ============================================================================
// flock_project_list
// ============================================================================

export const TOOL_NAME_PROJECT_LIST = 'flock_project_list';
export const TOOL_DESC_PROJECT_LIST = 'List all Flock projects';

export const flockProjectListSchema = z.object({});

export async function flockProjectList(db: FlockDatabase): Promise<ToolSuccess> {
  const allProjects = await db.db.select().from(projects).orderBy(desc(projects.created_at));

  return {
    success: true,
    data: {
      projects: allProjects,
      count: allProjects.length,
    },
  };
}

// ============================================================================
// flock_project_create
// ============================================================================

export const TOOL_NAME_PROJECT_CREATE = 'flock_project_create';
export const TOOL_DESC_PROJECT_CREATE = 'Create a new Flock project';

export const flockProjectCreateSchema = z.object({
  name: z.string().describe('Project name'),
  repoPath: z.string().describe('Path to the repository'),
  defaultBranch: z.string().optional().describe('Default branch name (default: main)'),
});

export interface FlockProjectCreateArgs {
  name: string;
  repoPath: string;
  defaultBranch?: string;
}

export async function flockProjectCreate(
  db: FlockDatabase,
  args: FlockProjectCreateArgs
): Promise<ToolSuccess> {
  const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();

  const newProject = {
    id,
    name: args.name,
    repo_path: args.repoPath,
    default_branch: args.defaultBranch ?? 'main',
    created_at: now,
  };

  await db.db.insert(projects).values(newProject);

  return {
    success: true,
    data: {
      project: newProject,
    },
  };
}

// ============================================================================
// flock_project_status
// ============================================================================

export const TOOL_NAME_PROJECT_STATUS = 'flock_project_status';
export const TOOL_DESC_PROJECT_STATUS = 'Get project details with task counts';

export const flockProjectStatusSchema = z.object({
  projectId: z.string().describe('Project ID'),
});

export interface FlockProjectStatusArgs {
  projectId: string;
}

export async function flockProjectStatus(
  db: FlockDatabase,
  args: FlockProjectStatusArgs
): Promise<ToolSuccess | ToolError> {
  const projectList = await db.db.select().from(projects).where(eq(projects.id, args.projectId));

  if (projectList.length === 0) {
    return {
      success: false,
      error: `Project not found: ${args.projectId}`,
      code: 'PROJECT_NOT_FOUND',
    };
  }

  const project = projectList[0];

  // Get task counts by status
  const { tasks } = db.schema;
  const allTasks = await db.db.select().from(tasks).where(eq(tasks.project_id, args.projectId));

  const taskCounts = allTasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    success: true,
    data: {
      project,
      taskCounts,
      totalTasks: allTasks.length,
    },
  };
}
