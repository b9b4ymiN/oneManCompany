/**
 * Branch Manager
 *
 * Manages git branches for agent workspaces.
 */

import { ok, err, type Result } from 'neverthrow';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { runGit, WorkspaceError, type WorkspaceErrorCode } from './git-worktree';

/**
 * Information about a file in a diff.
 */
export interface DiffFile {
  /** File path relative to repository root */
  path: string;
  /** File status */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Number of lines added */
  insertions: number;
  /** Number of lines deleted */
  deletions: number;
  /** Full diff patch for this file */
  patch?: string;
}

/**
 * Summary of changes between two branches.
 */
export interface DiffSummary {
  /** Total number of files changed */
  filesChanged: number;
  /** Total number of insertions */
  insertions: number;
  /** Total number of deletions */
  deletions: number;
  /** Individual file changes */
  files: DiffFile[];
}

/**
 * Parse git diff --numstat output into DiffFile array.
 *
 * @param numstatOutput - Output from git diff --numstat
 * @returns Array of DiffFile objects
 */
function parseNumstat(numstatOutput: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = numstatOutput.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const insertionsStr = parts[0] ?? '-';
      const deletionsStr = parts[1] ?? '-';
      const path = parts[2] ?? '';

      const insertions = insertionsStr === '-' ? 0 : parseInt(insertionsStr, 10);
      const deletions = deletionsStr === '-' ? 0 : parseInt(deletionsStr, 10);

      // Determine status based on insertions/deletions
      let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
      if (insertions > 0 && deletions === 0) {
        status = 'added';
      } else if (insertions === 0 && deletions > 0) {
        status = 'deleted';
      }

      files.push({
        path,
        status,
        insertions,
        deletions,
      });
    }
  }

  return files;
}

/**
 * Parse git diff --name-status output to determine file statuses.
 *
 * @param nameStatusOutput - Output from git diff --name-status
 * @returns Map of file path to status
 */
function parseNameStatus(nameStatusOutput: string): Map<string, 'added' | 'modified' | 'deleted' | 'renamed'> {
  const statusMap = new Map<string, 'added' | 'modified' | 'deleted' | 'renamed'>();
  const lines = nameStatusOutput.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    const statusChar = line[0];
    const path = line.substring(2);

    let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
    switch (statusChar) {
      case 'A':
        status = 'added';
        break;
      case 'D':
        status = 'deleted';
        break;
      case 'M':
        status = 'modified';
        break;
      case 'R':
        status = 'renamed';
        break;
    }

    statusMap.set(path, status);
  }

  return statusMap;
}

/**
 * Create a new branch from a base reference.
 *
 * @param workspacePath - Path to the workspace (where to create the branch)
 * @param branchName - Name of the new branch
 * @param baseRef - Base reference to branch from (branch, commit, or tag)
 * @returns Result indicating success or failure
 */
export async function createBranch(
  workspacePath: string,
  branchName: string,
  baseRef: string
): Promise<Result<void, WorkspaceError>> {
  // Validate inputs
  if (!branchName || !baseRef) {
    return err(
      new WorkspaceError(
        'INVALID_PATH',
        'Branch name and base reference are required',
        { branchName, baseRef }
      )
    );
  }

  // Check if workspace is a git repository
  const gitDir = resolve(workspacePath, '.git');
  if (!existsSync(gitDir)) {
    return err(
      new WorkspaceError('NOT_A_REPOSITORY', 'Not a git repository', { workspacePath })
    );
  }

  // Create the branch
  const result = await runGit(workspacePath, ['branch', branchName, baseRef]);

  if (result.isErr()) {
    return err(result.error);
  }

  if (result.value.exitCode !== 0) {
    const stderr = result.value.stderr;
    if (stderr.includes('already exists')) {
      return err(
        new WorkspaceError('BRANCH_EXISTS', `Branch already exists: ${branchName}`, { branchName })
      );
    }
    return err(
      new WorkspaceError('GIT_COMMAND_FAILED', `Failed to create branch: ${stderr}`, {
        stderr,
        exitCode: result.value.exitCode,
      })
    );
  }

  return ok(undefined);
}

/**
 * List all branches matching a prefix.
 *
 * @param projectPath - Path to the project repository
 * @param prefix - Branch name prefix to filter by
 * @returns Result containing array of branch names or an error
 */
export async function listBranches(
  projectPath: string,
  prefix: string
): Promise<Result<string[], WorkspaceError>> {
  const result = await runGit(projectPath, ['branch', '--list', `${prefix}*`]);

  if (result.isErr()) {
    return err(result.error);
  }

  const branches = result.value.stdout
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      // Remove leading * and whitespace
      return line.replace(/^\*?\s+/, '').trim();
    })
    .filter((branch) => branch.startsWith(prefix));

  return ok(branches);
}

/**
 * Delete a branch.
 *
 * @param projectPath - Path to the project repository
 * @param branchName - Name of the branch to delete
 * @returns Result indicating success or failure
 */
export async function deleteBranch(
  projectPath: string,
  branchName: string
): Promise<Result<void, WorkspaceError>> {
  // Validate inputs
  if (!branchName) {
    return err(
      new WorkspaceError('INVALID_PATH', 'Branch name is required', { branchName })
    );
  }

  // Delete the branch (force delete to handle unmerged branches)
  const result = await runGit(projectPath, ['branch', '-D', branchName]);

  if (result.isErr()) {
    return err(result.error);
  }

  if (result.value.exitCode !== 0) {
    const stderr = result.value.stderr;
    if (stderr.includes('not found')) {
      return err(
        new WorkspaceError('BRANCH_NOT_FOUND', `Branch not found: ${branchName}`, { branchName })
      );
    }
    return err(
      new WorkspaceError('GIT_COMMAND_FAILED', `Failed to delete branch: ${stderr}`, {
        stderr,
        exitCode: result.value.exitCode,
      })
    );
  }

  return ok(undefined);
}

/**
 * Get the diff between the workspace branch and the base branch.
 *
 * @param workspacePath - Path to the workspace
 * @param baseBranch - Base branch to compare against
 * @returns Result containing diff summary or an error
 */
export async function getBranchDiff(
  workspacePath: string,
  baseBranch: string
): Promise<Result<DiffSummary, WorkspaceError>> {
  // Get numstat output
  const numstatResult = await runGit(workspacePath, [
    'diff',
    '--numstat',
    `${baseBranch}...`,
  ]);

  if (numstatResult.isErr()) {
    return err(numstatResult.error);
  }

  // Get name-status output for accurate status detection
  const nameStatusResult = await runGit(workspacePath, [
    'diff',
    '--name-status',
    `${baseBranch}...`,
  ]);

  if (nameStatusResult.isErr()) {
    return err(nameStatusResult.error);
  }

  // Parse the outputs
  const files = parseNumstat(numstatResult.value.stdout);
  const statusMap = parseNameStatus(nameStatusResult.value.stdout);

  // Merge status information
  const filesWithStatus = files.map((file) => ({
    ...file,
    status: statusMap.get(file.path) || file.status,
  }));

  // Calculate totals
  const filesChanged = filesWithStatus.length;
  const insertions = filesWithStatus.reduce((sum, file) => sum + file.insertions, 0);
  const deletions = filesWithStatus.reduce((sum, file) => sum + file.deletions, 0);

  return ok({
    filesChanged,
    insertions,
    deletions,
    files: filesWithStatus,
  });
}
