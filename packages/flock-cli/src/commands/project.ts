import { safeEq, safeDesc } from '../drizzle-helpers';
/**
 * Flock Project Commands
 *
 * Project management commands for Flock.
 */

import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createDatabase, type FlockDatabase } from '@onemancompany/flock-kernel';
import { eq } from 'drizzle-orm';

/**
 * Detect if a path is a git repository.
 */
function isGitRepository(path: string): boolean {
  const gitDir = resolve(path, '.git');
  return existsSync(gitDir);
}

/**
 * Detect the default branch of a git repository.
 */
function detectDefaultBranch(repoPath: string): string {
  try {
    // Try to get the default branch from git remote
    const { execSync } = require('node:child_process');
    const refs = execSync(
      'git symbolic-ref refs/remotes/origin/HEAD',
      { cwd: repoPath, encoding: 'utf-8' }
    ).trim();
    // refs/remotes/origin/main -> main
    return refs.split('/').pop() || 'main';
  } catch {
    // Fallback to checking for common branch names
    const headsDir = resolve(repoPath, '.git', 'refs', 'heads');
    if (existsSync(headsDir)) {
      const { readdirSync } = require('node:fs');
      const branches = readdirSync(headsDir);
      if (branches.includes('main')) return 'main';
      if (branches.includes('master')) return 'master';
    }
    return 'main';
  }
}

/**
 * Get the nearest Flock database path.
 * Searches upward from current directory for .flock/flock.db.
 */
function findFlockDbPath(startPath: string): string | null {
  let currentPath = resolve(startPath);

  while (true) {
    const dbPath = resolve(currentPath, '.flock', 'flock.db');
    if (existsSync(dbPath)) {
      return dbPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      // Reached root without finding .flock
      return null;
    }
    currentPath = parentPath;
  }
}

/**
 * Register a project with Flock.
 */
function projectAddAction(projectPath: string): void {
  const resolvedPath = resolve(projectPath);

  // Verify the path exists
  if (!existsSync(resolvedPath)) {
    console.error(`Path does not exist: ${resolvedPath}`);
    process.exit(1);
  }

  // Verify it's a git repository
  if (!isGitRepository(resolvedPath)) {
    console.error(`Not a git repository: ${resolvedPath}`);
    process.exit(1);
  }

  // Find the Flock database (must be in current project or parent)
  const dbPath = findFlockDbPath(process.cwd());
  if (!dbPath) {
    console.error('Flock not initialized. Run `flock init` first.');
    process.exit(1);
  }

  // Initialize database
  const db = createDatabase(dbPath);

  // Get project name from directory or package.json
  let projectName = resolve(resolvedPath).split('/').pop() || 'unknown';
  const packageJsonPath = resolve(resolvedPath, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.name) {
        projectName = pkg.name;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Detect default branch
  const defaultBranch = detectDefaultBranch(resolvedPath);

  // Check if project already exists
  const existing = db.db
    .select()
    .from(db.schema.projects)
    .where(safeEq(db.schema.projects, "repo_path", resolvedPath))
    .get();

  if (existing) {
    console.log(`Project already registered: ${existing.name} (${existing.id})`);
    return;
  }

  // Create project record
  const projectId = randomUUID();
  const now = new Date().toISOString();

  (db.db.insert(db.schema.projects).values as any)({
    id: projectId,
    name: projectName,
    repo_path: resolvedPath,
    default_branch: defaultBranch,
    created_at: now,
  }).run();

  console.log(`✓ Project registered: ${projectName}`);
  console.log(`  ID: ${projectId}`);
  console.log(`  Path: ${resolvedPath}`);
  console.log(`  Default branch: ${defaultBranch}`);
}

/**
 * Project add command.
 */
export const projectAddCommand = new Command('add')
  .description('Add a project to Flock')
  .argument('<path>', 'Path to the project repository')
  .action(projectAddAction);
