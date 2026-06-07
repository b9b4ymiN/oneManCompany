/**
 * Git Worktree Manager
 *
 * Manages git worktrees for isolated agent workspaces.
 * Uses raw git CLI via child_process.spawn following the runProcess pattern.
 */

import { spawn } from 'node:child_process';
import { err, ok, type Result } from 'neverthrow';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { FlockError } from '../types';

// Re-export FlockError for convenience
export { FlockError } from '../types';
export type { FlockErrorCode } from '../types';

/**
 * Error codes for workspace operations.
 */
export type WorkspaceErrorCode =
  | 'WORKSPACE_CREATE_FAILED'
  | 'WORKSPACE_REMOVE_FAILED'
  | 'WORKTREE_EXISTS'
  | 'GIT_COMMAND_FAILED'
  | 'DIRTY_STATE'
  | 'INVALID_PATH'
  | 'NOT_A_REPOSITORY'
  | 'BRANCH_EXISTS'
  | 'BRANCH_NOT_FOUND';

/**
 * Workspace-specific error class.
 */
export class WorkspaceError extends Error {
  constructor(
    readonly code: WorkspaceErrorCode,
    message: string,
    readonly details: unknown = {}
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

/**
 * Information about a workspace.
 */
export interface WorkspaceInfo {
  /** Filesystem path to the workspace */
  path: string;
  /** Git branch name for this workspace */
  branch: string;
  /** Base branch this workspace was created from */
  baseBranch: string;
  /** Task ID this workspace belongs to */
  taskId: string;
  /** Agent ID this workspace belongs to */
  agentId: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** Whether the workspace has uncommitted changes */
  dirty: boolean;
}

/**
 * Result of checking workspace dirty state.
 */
export interface DirtyStatus {
  /** Whether there are uncommitted changes */
  dirty: boolean;
  /** List of uncommitted modified/deleted files */
  uncommitted: string[];
  /** List of untracked files */
  untracked: string[];
}

/**
 * Result of a git command execution.
 */
interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Execute a git command using child_process.spawn.
 *
 * @param repoPath - Path to the git repository
 * @param args - Arguments to pass to git
 * @param timeout - Optional timeout in milliseconds (default: 30000)
 * @returns Result containing the git output or an error
 */
export async function runGit(
  repoPath: string,
  args: string[],
  timeout = 30000
): Promise<Result<GitResult, WorkspaceError>> {
  const startedAt = Date.now();
  return await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let finished = false;

    const child = spawn('git', args, {
      cwd: repoPath,
      stdio: 'pipe',
    });

    const gitTimeout = setTimeout(() => {
      if (!finished) {
        child.kill('SIGKILL');
      }
    }, timeout);

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(gitTimeout);
      finished = true;
      resolve(
        err(
          new WorkspaceError(
            'GIT_COMMAND_FAILED',
            `Git command failed: ${error.message}`,
            { args, error: error.message }
          )
        )
      );
    });

    child.on('close', (code, signal) => {
      clearTimeout(gitTimeout);
      if (finished) {
        return;
      }
      finished = true;
      const durationMs = Date.now() - startedAt;
      resolve(
        ok({
          stdout,
          stderr,
          exitCode: code,
        })
      );
    });
  });
}

/**
 * Get the default branch for a repository.
 *
 * @param repoPath - Path to the git repository
 * @returns Result containing the branch name or an error
 */
async function getDefaultBranch(
  repoPath: string
): Promise<Result<string, WorkspaceError>> {
  const result = await runGit(repoPath, [
    'rev-parse',
    '--abbrev-ref',
    'origin/HEAD',
  ]);

  if (result.isErr()) {
    return err(result.error);
  }

  const branch = result.value.stdout.trim();
  // Remove 'origin/' prefix to get local branch name
  const defaultBranch = branch.replace(/^origin\//, '');

  if (!defaultBranch || defaultBranch === 'origin/HEAD') {
    // Fallback to 'main' or 'master' if origin/HEAD is not set
    const mainCheck = await runGit(repoPath, ['rev-parse', '--verify', 'main']);
    if (mainCheck.isOk()) {
      return ok('main');
    }
    const masterCheck = await runGit(repoPath, [
      'rev-parse',
      '--verify',
      'master',
    ]);
    if (masterCheck.isOk()) {
      return ok('master');
    }
    return err(
      new WorkspaceError(
        'NOT_A_REPOSITORY',
        'Could not determine default branch',
        { repoPath }
      )
    );
  }

  return ok(defaultBranch);
}

/**
 * List all workspaces for a project.
 *
 * @param projectPath - Path to the project
 * @returns Result containing array of workspace info or an error
 */
export async function listWorkspaces(
  projectPath: string
): Promise<Result<WorkspaceInfo[], WorkspaceError>> {
  const workspacesDir = resolve(projectPath, '.flock', 'workspaces');

  if (!existsSync(workspacesDir)) {
    return ok([]);
  }

  const result = await runGit(projectPath, ['worktree', 'list', '--porcelain']);

  if (result.isErr()) {
    return err(result.error);
  }

  const workspaces: WorkspaceInfo[] = [];
  const lines = result.value.stdout.split('\n');
  let currentPath: string | null = null;
  let currentBranch: string | null = null;
  let currentBase: string | null = null;

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (currentPath && currentBranch) {
        // Check if this is a flock workspace
        if (currentPath.includes('.flock/workspaces/')) {
          const pathParts = currentPath.split('/');
          const workspaceDir = pathParts[pathParts.length - 1];
          if (workspaceDir) {
            const match = workspaceDir.match(/^(.+)-(.+)$/);
            if (match && match[1] && match[2]) {
              const taskId = match[1];
              const agentId = match[2];
              workspaces.push({
                path: currentPath,
                branch: currentBranch,
                baseBranch: currentBase || 'main',
                taskId,
                agentId,
                createdAt: new Date().toISOString(), // Would be stored in metadata in production
                dirty: false, // Will be updated by detectDirtyState
              });
            }
          }
        }
      }
      currentPath = line.slice(9);
      currentBranch = null;
      currentBase = null;
    } else if (line.startsWith('branch ')) {
      currentBranch = line.slice(7).replace('refs/heads/', '');
    } else if (line.startsWith('HEAD ')) {
      // Detached HEAD, skip
    }
  }

  // Don't forget the last worktree
  if (currentPath && currentBranch && currentPath.includes('.flock/workspaces/')) {
    const pathParts = currentPath.split('/');
    const workspaceDir = pathParts[pathParts.length - 1];
    if (workspaceDir) {
      const match = workspaceDir.match(/^(.+)-(.+)$/);
      if (match && match[1] && match[2]) {
        const taskId = match[1];
        const agentId = match[2];
        workspaces.push({
          path: currentPath,
          branch: currentBranch,
          baseBranch: currentBase || 'main',
          taskId,
          agentId,
          createdAt: new Date().toISOString(),
          dirty: false,
        });
      }
    }
  }

  return ok(workspaces);
}

/**
 * Create a new git worktree for an agent task.
 *
 * @param projectPath - Path to the project repository
 * @param taskSlug - Slug/identifier for the task
 * @param agentId - ID of the agent
 * @returns Result containing workspace info or an error
 */
export async function createWorktree(
  projectPath: string,
  taskSlug: string,
  agentId: string
): Promise<Result<WorkspaceInfo, WorkspaceError>> {
  // Validate inputs
  if (!taskSlug || !agentId) {
    return err(
      new WorkspaceError(
        'INVALID_PATH',
        'Task slug and agent ID are required',
        { taskSlug, agentId }
      )
    );
  }

  // Check if project is a git repository
  const gitDir = resolve(projectPath, '.git');
  if (!existsSync(gitDir)) {
    return err(
      new WorkspaceError(
        'NOT_A_REPOSITORY',
        'Not a git repository',
        { projectPath }
      )
    );
  }

  // Get default branch
  const defaultBranchResult = await getDefaultBranch(projectPath);
  if (defaultBranchResult.isErr()) {
    return err(defaultBranchResult.error);
  }
  const defaultBranch = defaultBranchResult.value;

  // Create workspaces directory if it doesn't exist
  const workspacesDir = resolve(projectPath, '.flock', 'workspaces');
  if (!existsSync(workspacesDir)) {
    mkdirSync(workspacesDir, { recursive: true });
  }

  // Create workspace path
  const workspaceName = `${taskSlug}-${agentId}`;
  const workspacePath = resolve(workspacesDir, workspaceName);

  // Check if workspace already exists
  if (existsSync(workspacePath)) {
    return err(
      new WorkspaceError(
        'WORKTREE_EXISTS',
        'Workspace already exists',
        { workspacePath }
      )
    );
  }

  // Create branch name
  const branchName = `flock/${agentId}-${taskSlug}`;

  // Create the worktree
  const result = await runGit(projectPath, [
    'worktree',
    'add',
    '-b',
    branchName,
    workspacePath,
    defaultBranch,
  ]);

  if (result.isErr()) {
    return err(result.error);
  }

  if (result.value.exitCode !== 0) {
    return err(
      new WorkspaceError(
        'WORKSPACE_CREATE_FAILED',
        `Failed to create worktree: ${result.value.stderr}`,
        { stderr: result.value.stderr, exitCode: result.value.exitCode }
      )
    );
  }

  return ok({
    path: workspacePath,
    branch: branchName,
    baseBranch: defaultBranch,
    taskId: taskSlug,
    agentId,
    createdAt: new Date().toISOString(),
    dirty: false,
  });
}

/**
 * Remove a git worktree and clean up the workspace.
 *
 * @param workspacePath - Path to the workspace to remove
 * @param projectPath - Path to the project repository (for running git commands)
 * @returns Result indicating success or failure
 */
export async function removeWorktree(
  workspacePath: string,
  projectPath: string
): Promise<Result<void, WorkspaceError>> {
  // Check if workspace exists
  if (!existsSync(workspacePath)) {
    return ok(undefined);
  }

  // Remove the worktree
  const result = await runGit(projectPath, ['worktree', 'remove', workspacePath]);

  if (result.isErr()) {
    return err(result.error);
  }

  if (result.value.exitCode !== 0) {
    return err(
      new WorkspaceError(
        'WORKSPACE_REMOVE_FAILED',
        `Failed to remove worktree: ${result.value.stderr}`,
        { stderr: result.value.stderr, exitCode: result.value.exitCode }
      )
    );
  }

  return ok(undefined);
}

/**
 * Detect the dirty state of a workspace.
 *
 * @param workspacePath - Path to the workspace
 * @returns Result containing dirty status or an error
 */
export async function detectDirtyState(
  workspacePath: string
): Promise<Result<DirtyStatus, WorkspaceError>> {
  // Check for uncommitted changes
  const diffResult = await runGit(workspacePath, ['status', '--porcelain']);

  if (diffResult.isErr()) {
    return err(diffResult.error);
  }

  const lines = diffResult.value.stdout.split('\n').filter((line) => line.trim());

  const uncommitted: string[] = [];
  const untracked: string[] = [];

  for (const line of lines) {
    const status = line.substring(0, 2).trim();
    const filePath = line.substring(3);

    if (status === '??') {
      untracked.push(filePath);
    } else {
      uncommitted.push(filePath);
    }
  }

  return ok({
    dirty: uncommitted.length > 0 || untracked.length > 0,
    uncommitted,
    untracked,
  });
}
