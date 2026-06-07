/**
 * Workspace Module Barrel Export
 *
 * Exports all workspace management functionality.
 */

// ============================================================================
// Git Worktree Manager
// ============================================================================

export {
  createWorktree,
  removeWorktree,
  detectDirtyState,
  listWorkspaces,
} from './git-worktree';

export type {
  WorkspaceInfo,
  DirtyStatus,
} from './git-worktree';

export {
  WorkspaceError,
} from './git-worktree';

export type {
  WorkspaceErrorCode,
} from './git-worktree';

// ============================================================================
// Branch Manager
// ============================================================================

export {
  createBranch,
  listBranches,
  deleteBranch,
  getBranchDiff,
} from './branch-manager';

export type {
  DiffFile,
  DiffSummary,
} from './branch-manager';

// ============================================================================
// Diff Service
// ============================================================================

export {
  collectDiff,
  generateDiffReport,
  generateCompactSummary,
  generateDetailedReport,
  collectDiffWithPatches,
} from './diff-service';

// ============================================================================
// Workspace Lifecycle
// ============================================================================

export {
  initWorkspace,
  isFlockInitialized,
  getFlockDirectories,
  createWorkspace,
  cleanupWorkspace,
  listAllWorkspaces,
  getWorkspace,
  saveWorkspaceMetadata,
  loadWorkspaceMetadata,
} from './workspace-lifecycle';

export type {
  FlockDirectories,
} from './workspace-lifecycle';
