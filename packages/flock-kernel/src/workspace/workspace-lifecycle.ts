/**
 * Workspace Lifecycle Manager
 *
 * Manages the lifecycle of Flock workspaces including initialization
 * and cleanup of workspace directories and resources.
 */

import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ok, err, type Result } from 'neverthrow';
import { WorkspaceError, type WorkspaceErrorCode } from './git-worktree';
import { createWorktree, removeWorktree, listWorkspaces } from './git-worktree';
import { deleteBranch } from './branch-manager';
import type { WorkspaceInfo } from './git-worktree';

/**
 * Flock directory structure.
 */
export interface FlockDirectories {
  /** Main .flock directory */
  root: string;
  /** Workspaces directory */
  workspaces: string;
  /** Logs directory */
  logs: string;
  /** Artifacts directory */
  artifacts: string;
  /** Database file */
  database: string;
  /** Config file */
  config: string;
}

/**
 * Initialize the Flock workspace structure for a project.
 *
 * Creates the .flock/ directory structure:
 * ```
 * .flock/
 *   flock.db
 *   config.yaml
 *   workspaces/
 *   logs/
 *   artifacts/
 * ```
 *
 * Also creates a .gitignore inside .flock/ to ignore workspaces.
 *
 * @param projectPath - Path to the project root
 * @returns Result containing the directory structure or an error
 */
export async function initWorkspace(
  projectPath: string
): Promise<Result<FlockDirectories, WorkspaceError>> {
  try {
    // Create .flock directory
    const flockDir = resolve(projectPath, '.flock');
    if (!existsSync(flockDir)) {
      mkdirSync(flockDir, { recursive: true });
    }

    // Create subdirectories
    const dirs: FlockDirectories = {
      root: flockDir,
      workspaces: resolve(flockDir, 'workspaces'),
      logs: resolve(flockDir, 'logs'),
      artifacts: resolve(flockDir, 'artifacts'),
      database: resolve(flockDir, 'flock.db'),
      config: resolve(flockDir, 'config.yaml'),
    };

    mkdirSync(dirs.workspaces, { recursive: true });
    mkdirSync(dirs.logs, { recursive: true });
    mkdirSync(dirs.artifacts, { recursive: true });

    // Create .gitignore inside .flock/
    const gitignorePath = resolve(flockDir, '.gitignore');
    if (!existsSync(gitignorePath)) {
      writeFileSync(
        gitignorePath,
        `# Flock workspace artifacts
workspaces/
*.log
*.db
config.yaml
`,
        'utf-8'
      );
    }

    return ok(dirs);
  } catch (error) {
    return err(
      new WorkspaceError(
        'WORKSPACE_CREATE_FAILED',
        `Failed to initialize workspace: ${error instanceof Error ? error.message : String(error)}`,
        { error }
      )
    );
  }
}

/**
 * Check if Flock has been initialized for a project.
 *
 * @param projectPath - Path to the project root
 * @returns True if .flock directory exists
 */
export function isFlockInitialized(projectPath: string): boolean {
  const flockDir = resolve(projectPath, '.flock');
  return existsSync(flockDir);
}

/**
 * Get the Flock directories for a project.
 *
 * @param projectPath - Path to the project root
 * @returns Flock directories structure
 */
export function getFlockDirectories(projectPath: string): FlockDirectories {
  const flockDir = resolve(projectPath, '.flock');
  return {
    root: flockDir,
    workspaces: resolve(flockDir, 'workspaces'),
    logs: resolve(flockDir, 'logs'),
    artifacts: resolve(flockDir, 'artifacts'),
    database: resolve(flockDir, 'flock.db'),
    config: resolve(flockDir, 'config.yaml'),
  };
}

/**
 * Create a new workspace for a task.
 *
 * Initializes the Flock structure if needed, then creates a worktree.
 *
 * @param projectPath - Path to the project root
 * @param taskId - ID of the task
 * @param agentId - ID of the agent
 * @returns Result containing workspace info or an error
 */
export async function createWorkspace(
  projectPath: string,
  taskId: string,
  agentId: string
): Promise<Result<WorkspaceInfo, WorkspaceError>> {
  // Ensure Flock is initialized
  const initResult = await initWorkspace(projectPath);
  if (initResult.isErr()) {
    return err(initResult.error);
  }

  // Create the worktree
  return await createWorktree(projectPath, taskId, agentId);
}

/**
 * Cleanup a workspace after task completion.
 *
 * @param projectPath - Path to the project root
 * @param taskId - ID of the task
 * @param agentId - ID of the agent
 * @param preserve - If true, keeps the workspace for inspection
 * @returns Result indicating success or failure
 */
export async function cleanupWorkspace(
  projectPath: string,
  taskId: string,
  agentId: string,
  preserve = false
): Promise<Result<void, WorkspaceError>> {
  // List workspaces to find the one to cleanup
  const listResult = await listWorkspaces(projectPath);
  if (listResult.isErr()) {
    return err(listResult.error);
  }

  const workspaces = listResult.value;
  const workspace = workspaces.find((w) => w.taskId === taskId && w.agentId === agentId);

  if (!workspace) {
    // Workspace not found, nothing to cleanup
    return ok(undefined);
  }

  // If preserve is true, keep the workspace
  if (preserve) {
    return ok(undefined);
  }

  // Remove the worktree
  const removeResult = await removeWorktree(workspace.path, projectPath);
  if (removeResult.isErr()) {
    return err(removeResult.error);
  }

  // Delete the branch
  const deleteResult = await deleteBranch(projectPath, workspace.branch);
  if (deleteResult.isErr()) {
    return err(deleteResult.error);
  }

  // Clean up workspace artifacts directory
  const dirs = getFlockDirectories(projectPath);
  const workspaceArtifactsDir = resolve(dirs.artifacts, `${taskId}-${agentId}`);
  if (existsSync(workspaceArtifactsDir)) {
    rmSync(workspaceArtifactsDir, { recursive: true, force: true });
  }

  return ok(undefined);
}

/**
 * List all workspaces for a project.
 *
 * @param projectPath - Path to the project root
 * @returns Result containing array of workspace info or an error
 */
export async function listAllWorkspaces(
  projectPath: string
): Promise<Result<WorkspaceInfo[], WorkspaceError>> {
  return await listWorkspaces(projectPath);
}

/**
 * Get workspace info for a specific task and agent.
 *
 * @param projectPath - Path to the project root
 * @param taskId - ID of the task
 * @param agentId - ID of the agent
 * @returns Result containing workspace info or an error
 */
export async function getWorkspace(
  projectPath: string,
  taskId: string,
  agentId: string
): Promise<Result<WorkspaceInfo | null, WorkspaceError>> {
  const listResult = await listWorkspaces(projectPath);
  if (listResult.isErr()) {
    return err(listResult.error);
  }

  const workspace = listResult.value.find((w) => w.taskId === taskId && w.agentId === agentId);

  return ok(workspace || null);
}

/**
 * Save workspace metadata for a task.
 *
 * Stores task-related metadata in the workspace artifacts directory.
 *
 * @param projectPath - Path to the project root
 * @param taskId - ID of the task
 * @param agentId - ID of the agent
 * @param metadata - Metadata to store
 * @returns Result indicating success or failure
 */
export async function saveWorkspaceMetadata(
  projectPath: string,
  taskId: string,
  agentId: string,
  metadata: Record<string, unknown>
): Promise<Result<void, WorkspaceError>> {
  try {
    const dirs = getFlockDirectories(projectPath);
    const workspaceArtifactsDir = resolve(dirs.artifacts, `${taskId}-${agentId}`);

    if (!existsSync(workspaceArtifactsDir)) {
      mkdirSync(workspaceArtifactsDir, { recursive: true });
    }

    const metadataPath = resolve(workspaceArtifactsDir, 'metadata.json');
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    return ok(undefined);
  } catch (error) {
    return err(
      new WorkspaceError(
        'WORKSPACE_CREATE_FAILED',
        `Failed to save metadata: ${error instanceof Error ? error.message : String(error)}`,
        { error }
      )
    );
  }
}

/**
 * Load workspace metadata for a task.
 *
 * @param projectPath - Path to the project root
 * @param taskId - ID of the task
 * @param agentId - ID of the agent
 * @returns Result containing metadata or an error
 */
export async function loadWorkspaceMetadata(
  projectPath: string,
  taskId: string,
  agentId: string
): Promise<Result<Record<string, unknown> | null, WorkspaceError>> {
  try {
    const dirs = getFlockDirectories(projectPath);
    const metadataPath = resolve(dirs.artifacts, `${taskId}-${agentId}`, 'metadata.json');

    if (!existsSync(metadataPath)) {
      return ok(null);
    }

    const content = readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(content) as Record<string, unknown>;

    return ok(metadata);
  } catch (error) {
    return err(
      new WorkspaceError(
        'WORKSPACE_CREATE_FAILED',
        `Failed to load metadata: ${error instanceof Error ? error.message : String(error)}`,
        { error }
      )
    );
  }
}
