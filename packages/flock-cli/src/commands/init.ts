/**
 * Flock Init Command
 *
 * Initializes Flock in the current project by:
 * 1. Creating .flock/ directory structure
 * 2. Writing default config.yaml
 * 3. Initializing SQLite database
 */

import { initWorkspace, isFlockInitialized, getFlockDirectories } from '@onemancompany/flock-kernel';
import { createDatabase } from '@onemancompany/flock-kernel';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Default flock.yaml configuration.
 */
const DEFAULT_CONFIG = `# Flock Configuration
# See https://flock.dev/docs/config for reference

agents:
  claude-code:
    type: cli
    command: claude
    args:
      - --dangerously-skip-permissions
    mode: write

  codex:
    type: cli
    command: codex
    args: []
    mode: write

  gemini-reviewer:
    type: cli
    command: gemini
    args: []
    mode: readonly

gates:
  typecheck:
    command: bun run typecheck

  test:
    command: bun run test

  lint:
    command: bun run lint

policies:
  require_human_approval_before_merge: true
  forbid_direct_main_branch_write: true
  require_diff_summary: true
  require_tests_for_code_change: true
  preserve_failed_workspaces: true
  max_parallel_runs: 4
  default_timeout_minutes: 60
`;

/**
 * Initialize Flock in the current project.
 */
export async function initCommand(): Promise<void> {
  const projectPath = process.cwd();

  // Check if already initialized
  if (isFlockInitialized(projectPath)) {
    console.log('Flock is already initialized in this project.');
    const dirs = getFlockDirectories(projectPath);
    console.log(`  Config: ${dirs.config}`);
    console.log(`  Database: ${dirs.database}`);
    return;
  }

  console.log('Initializing Flock...');

  // Create workspace structure
  const initResult = await initWorkspace(projectPath);
  if (initResult.isErr()) {
    console.error(`Failed to initialize workspace: ${initResult.error.message}`);
    process.exit(1);
  }

  const dirs = initResult.value;

  // Write default config
  if (!existsSync(dirs.config)) {
    writeFileSync(dirs.config, DEFAULT_CONFIG, 'utf-8');
    console.log(`  ✓ Created config: ${dirs.config}`);
  }

  // Initialize database (this creates the file and runs migrations)
  try {
    const db = createDatabase(dirs.database);
    // Database is initialized, tables will be created on first use
    console.log(`  ✓ Created database: ${dirs.database}`);
  } catch (error) {
    console.error(`  ✗ Failed to initialize database: ${error}`);
    process.exit(1);
  }

  console.log('\nFlock initialized successfully!');
  console.log('\nNext steps:');
  console.log('  1. Review and customize .flock/config.yaml');
  console.log('  2. Register your project: flock project add .');
  console.log('  3. Create a task: flock task create "Add feature X"');
}
