#!/usr/bin/env node
import { Command } from 'commander';
import { healthCommand } from './commands/health';
import { journalListCommand, journalShowCommand } from './commands/journal';
import { replayCommand } from './commands/replay';
import { runCommand } from './commands/run';
import { statusCommand } from './commands/status';

const program = new Command();
program.name('omc').description('onemancompany CLI');

program
  .command('run')
  .argument('<brief>')
  .action(async (brief: string) => {
    console.log(await runCommand(brief));
  });

program
  .command('status')
  .argument('<mission_id>')
  .action((missionId: string) => {
    console.log(statusCommand(missionId));
  });

program
  .command('replay')
  .argument('<mission_id>')
  .action((missionId: string) => {
    console.log(replayCommand(missionId));
  });

program.command('health').action(async () => {
  console.log(await healthCommand());
});

const journal = program.command('journal');
journal.command('list').action(() => {
  console.log(journalListCommand());
});
journal
  .command('show')
  .argument('<id>')
  .action((id: string) => {
    console.log(journalShowCommand(id));
  });

void program.parseAsync(process.argv);
