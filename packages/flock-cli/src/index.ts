#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { projectAddCommand } from './commands/project';
import { taskCreateCommand } from './commands/task';
import { runCommand } from './commands/run';
import { diffCommand } from './commands/diff';
import { testCommand } from './commands/test';
import { reviewCommand } from './commands/review';
import { approveCommand } from './commands/approve';
import { rejectCommand } from './commands/reject';
import { mergeCommand } from './commands/merge';
import { statusCommand } from './commands/status';
import { listCommand } from './commands/list';
import { mcpCommand } from './commands/mcp';

const program = new Command();
program
  .name('flock')
  .description('Flock - Agent control tower for multi-agent coordination')
  .version('0.1.0');

// Init command
program
  .command('init')
  .description('Initialize Flock in the current project')
  .action(async () => {
    await initCommand();
  });

// Project commands
program
  .command('project')
  .description('Project management commands')
  .addCommand(projectAddCommand);

// Task commands
program
  .command('task')
  .description('Task management commands')
  .addCommand(taskCreateCommand);

// Run command
program
  .command('run')
  .argument('<taskId>', 'Task ID to run')
  .option('-a, --agent <agentId>', 'Agent ID to use', 'claude-code')
  .option('-t, --timeout <minutes>', 'Timeout in minutes', '60')
  .description('Run a task with an agent')
  .action(async (taskId: string, options: { agent: string; timeout: string }) => {
    await runCommand(taskId, options);
  });

// Diff command
program
  .command('diff')
  .argument('<taskId>', 'Task ID')
  .option('-f, --full', 'Show full patch', false)
  .description('Show diff for a task')
  .action(async (taskId: string, options: { full: boolean }) => {
    await diffCommand(taskId, options);
  });

// Test command
program
  .command('test')
  .argument('<taskId>', 'Task ID')
  .description('Run gates for a task')
  .action(async (taskId: string) => {
    await testCommand(taskId);
  });

// Review command
program
  .command('review')
  .argument('<taskId>', 'Task ID')
  .description('Review a task')
  .action(async (taskId: string) => {
    await reviewCommand(taskId);
  });

// Approve command
program
  .command('approve')
  .argument('<taskId>', 'Task ID')
  .description('Approve a task')
  .action(async (taskId: string) => {
    await approveCommand(taskId);
  });

// Reject command
program
  .command('reject')
  .argument('<taskId>', 'Task ID')
  .option('-r, --reason <reason>', 'Reason for rejection')
  .description('Reject a task')
  .action(async (taskId: string, options: { reason?: string }) => {
    await rejectCommand(taskId, options);
  });

// Merge command
program
  .command('merge')
  .argument('<taskId>', 'Task ID')
  .option('-p, --preserve', 'Preserve workspace after merge', false)
  .description('Merge a task')
  .action(async (taskId: string, options: { preserve: boolean }) => {
    await mergeCommand(taskId, options);
  });

// Status command
program
  .command('status')
  .argument('[taskId]', 'Task ID (optional, shows all if not provided)')
  .description('Show task status')
  .action(async (taskId?: string) => {
    await statusCommand(taskId);
  });

// List command
program
  .command('list')
  .description('List all tasks')
  .action(async () => {
    await listCommand();
  });

// MCP command
program
  .command('mcp')
  .description('Start Flock MCP server for Claude Code integration')
  .action(async () => {
    await mcpCommand();
  });

void program.parseAsync(process.argv);
