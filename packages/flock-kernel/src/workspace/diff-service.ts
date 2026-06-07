/**
 * Diff Service
 *
 * Provides diff collection and reporting for workspace changes.
 */

import { ok, err, type Result } from 'neverthrow';
import { runGit } from './git-worktree';
import type { WorkspaceError } from './git-worktree';
import { getBranchDiff } from './branch-manager';
import type { DiffSummary } from './branch-manager';

// Re-export types
export type { WorkspaceError } from './git-worktree';
export type { DiffSummary, DiffFile } from './branch-manager';

/**
 * Collect a comprehensive diff summary between the workspace and base branch.
 *
 * @param workspacePath - Path to the workspace
 * @param baseBranch - Base branch to compare against
 * @returns Result containing diff summary or an error
 */
export async function collectDiff(
  workspacePath: string,
  baseBranch: string
): Promise<Result<DiffSummary, WorkspaceError>> {
  return await getBranchDiff(workspacePath, baseBranch);
}

/**
 * Generate a human-readable diff report from a diff summary.
 *
 * @param diff - The diff summary to report on
 * @returns Formatted diff report string
 */
export function generateDiffReport(diff: DiffSummary): string {
  const lines: string[] = [];

  lines.push('=== Diff Summary ===');
  lines.push('');
  lines.push(`Files changed: ${diff.filesChanged}`);
  lines.push(`Insertions: ${diff.insertions}`);
  lines.push(`Deletions: ${diff.deletions}`);
  lines.push('');

  if (diff.files.length > 0) {
    lines.push('=== Files ===');
    lines.push('');

    for (const file of diff.files) {
      const statusIcon = getStatusIcon(file.status);
      lines.push(`${statusIcon} ${file.path} (+${file.insertions}, -${file.deletions})`);
    }
  } else {
    lines.push('No changes detected.');
  }

  lines.push('');
  lines.push('=== End of Diff ===');

  return lines.join('\n');
}

/**
 * Generate a compact one-line diff summary.
 *
 * @param diff - The diff summary to report on
 * @returns Compact diff summary string
 */
export function generateCompactSummary(diff: DiffSummary): string {
  if (diff.filesChanged === 0) {
    return 'No changes';
  }

  const parts: string[] = [];
  parts.push(`${diff.filesChanged} file${diff.filesChanged === 1 ? '' : 's'}`);

  if (diff.insertions > 0) {
    parts.push(`+${diff.insertions}`);
  }

  if (diff.deletions > 0) {
    parts.push(`-${diff.deletions}`);
  }

  return parts.join(', ');
}

/**
 * Get a status icon for a file status.
 *
 * @param status - The file status
 * @returns Icon character
 */
function getStatusIcon(status: 'added' | 'modified' | 'deleted' | 'renamed'): string {
  switch (status) {
    case 'added':
      return '+';
    case 'modified':
      return '~';
    case 'deleted':
      return '-';
    case 'renamed':
      return '→';
  }
}

/**
 * Generate a detailed diff report with patches for each file.
 *
 * @param diff - The diff summary
 * @param patches - Map of file path to patch content
 * @returns Detailed diff report string
 */
export function generateDetailedReport(
  diff: DiffSummary,
  patches: Map<string, string>
): string {
  const lines: string[] = [];

  lines.push('=== Detailed Diff Report ===');
  lines.push('');
  lines.push(`Files changed: ${diff.filesChanged}`);
  lines.push(`Insertions: ${diff.insertions}`);
  lines.push(`Deletions: ${diff.deletions}`);
  lines.push('');

  if (diff.files.length > 0) {
    lines.push('=== Files ===');
    lines.push('');

    for (const file of diff.files) {
      const statusIcon = getStatusIcon(file.status);
      lines.push(`${statusIcon} ${file.path} (+${file.insertions}, -${file.deletions})`);

      const patch = patches.get(file.path);
      if (patch) {
        lines.push('');
        lines.push('```diff');
        lines.push(patch);
        lines.push('```');
      }

      lines.push('');
    }
  } else {
    lines.push('No changes detected.');
  }

  lines.push('=== End of Report ===');

  return lines.join('\n');
}

/**
 * Collect diff with full patches for each file.
 *
 * @param workspacePath - Path to the workspace
 * @param baseBranch - Base branch to compare against
 * @returns Result containing diff summary with patches or an error
 */
export async function collectDiffWithPatches(
  workspacePath: string,
  baseBranch: string
): Promise<Result<{ diff: DiffSummary; patches: Map<string, string> }, WorkspaceError>> {
  // Get the diff summary
  const diffResult = await getBranchDiff(workspacePath, baseBranch);
  if (diffResult.isErr()) {
    return err(diffResult.error);
  }

  const diff = diffResult.value;

  // Collect patches for each file
  const patches = new Map<string, string>();

  for (const file of diff.files) {
    const patchResult = await runGit(workspacePath, [
      'diff',
      `${baseBranch}...`,
      '--',
      file.path,
    ]);

    if (patchResult.isOk()) {
      patches.set(file.path, patchResult.value.stdout);
    }
  }

  return ok({ diff, patches });
}
