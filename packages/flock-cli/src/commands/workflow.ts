/**
 * Flock Workflow Commands
 *
 * Execute workflow patterns for multi-agent orchestration.
 */

import { Command } from 'commander';
import { resolve } from 'node:path';
import { createDatabase, createWorkflowRunner } from '@onemancompany/flock-kernel';
import { safeEq } from '../drizzle-helpers';

/**
 * Find the Flock database path.
 */
function findFlockDbPath(): string {
  return resolve(process.cwd(), '.flock', 'flock.db');
}

/**
 * Find project ID from current directory.
 */
function findProjectId(db: ReturnType<typeof createDatabase>): string | null {
  const currentPath = resolve(process.cwd());
  const projects = db.db.select().from(db.schema.projects).all();

  const matchingProject = projects.find((p) => {
    return currentPath.startsWith(p.repo_path);
  });

  return matchingProject?.id || null;
}

/**
 * Execute sequential workflow action.
 */
async function sequentialAction(options: {
  agents: string;
  title: string;
  description?: string;
  priority?: string;
  projectId?: string;
}): Promise<void> {
  const db = createDatabase(findFlockDbPath());

  // Get or find project
  let projectId = options.projectId;
  if (!projectId) {
    projectId = findProjectId(db);
    if (!projectId) {
      console.error('No project found for current directory. Specify --project-id or run `flock project add .`');
      process.exit(1);
    }
  }

  // Verify project exists
  const project = db.db.select().from(db.schema.projects).where(safeEq(db.schema.projects, 'id', projectId)).get();

  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  // Parse agents list
  const agents = options.agents.split(',').map((a) => a.trim());
  if (agents.length < 2) {
    console.error('Sequential workflow requires at least 2 agents');
    process.exit(1);
  }

  // Create workflow runner
  const workflowRunner = createWorkflowRunner(db);

  // Build sequential chain
  const chain = {
    tasks: agents.map((agentId, index) => ({
      title: `${options.title} - Step ${index + 1}`,
      agentId,
      description: options.description,
      priority: options.priority as 'low' | 'medium' | 'high' | 'critical' | undefined,
    })),
  };

  const result = await workflowRunner.executeSequentialChain(chain, { projectId });

  if (result.isErr()) {
    console.error(`Failed to create workflow: ${result.error.message}`);
    process.exit(1);
  }

  console.log(`✓ Sequential workflow created with ${result.value.taskIds.length} tasks`);
  console.log(`  Project: ${project.name}`);
  for (const taskId of result.value.taskIds) {
    console.log(`  - ${taskId}`);
  }
}

/**
 * Execute review pipeline workflow action.
 */
async function reviewPipelineAction(options: {
  implementer: string;
  tester: string;
  reviewer: string;
  title: string;
  description: string;
  priority?: string;
  requiredApprovals?: string;
  projectId?: string;
}): Promise<void> {
  const db = createDatabase(findFlockDbPath());

  // Get or find project
  let projectId = options.projectId;
  if (!projectId) {
    projectId = findProjectId(db);
    if (!projectId) {
      console.error('No project found for current directory. Specify --project-id or run `flock project add .`');
      process.exit(1);
    }
  }

  // Verify project exists
  const project = db.db.select().from(db.schema.projects).where(safeEq(db.schema.projects, 'id', projectId)).get();

  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  // Create workflow runner
  const workflowRunner = createWorkflowRunner(db);

  // Build review pipeline
  const pipeline = {
    implement: {
      agentId: options.implementer,
      title: options.title,
      description: options.description,
      priority: options.priority as 'low' | 'medium' | 'high' | 'critical' | undefined,
    },
    test: {
      agentId: options.tester,
      description: `Test and verify: ${options.title}`,
    },
    review: {
      agentId: options.reviewer,
      requiredApprovals: options.requiredApprovals ? parseInt(options.requiredApprovals, 10) : 1,
    },
  };

  const result = await workflowRunner.executeReviewPipeline(pipeline, { projectId });

  if (result.isErr()) {
    console.error(`Failed to create workflow: ${result.error.message}`);
    process.exit(1);
  }

  console.log(`✓ Review pipeline workflow created with ${result.value.taskIds.length} tasks`);
  console.log(`  Project: ${project.name}`);
  console.log(`  Implementation: ${result.value.taskIds[0]}`);
  console.log(`  Testing: ${result.value.taskIds[1]}`);
  console.log(`  Review: Auto-assigned to ${options.reviewer}`);
}

/**
 * Export workflow commands.
 */
export const workflowCommands = [
  new Command('sequential')
    .description('Execute a sequential chain workflow')
    .option('--agents <agent1,agent2,...>', 'Comma-separated list of agents (ordered)')
    .option('--title <title>', 'Workflow title')
    .option('-d, --description <text>', 'Task description')
    .option('-p, --priority <level>', 'Priority level (low|medium|high|critical)', 'medium')
    .option('--project-id <id>', 'Project ID (auto-detected if not specified)')
    .action(sequentialAction),

  new Command('review-pipeline')
    .description('Execute a review pipeline workflow')
    .option('--implementer <agentId>', 'Agent to implement')
    .option('--tester <agentId>', 'Agent to test')
    .option('--reviewer <agentId>', 'Agent to review')
    .option('--title <title>', 'Task title')
    .option('-d, --description <text>', 'Task description')
    .option('-p, --priority <level>', 'Priority level (low|medium|high|critical)', 'medium')
    .option('--required-approvals <n>', 'Number of required approvals', '1')
    .option('--project-id <id>', 'Project ID (auto-detected if not specified)')
    .action(reviewPipelineAction),
];
