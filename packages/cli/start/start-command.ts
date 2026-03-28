import { Command } from 'commander';
import { startProject } from './start-project';

export function startCommand(program: Command): void {
  program
    .command('start')
    .alias('s')
    .description('Start the application')
    .option('-w, --watch', 'Run in watch mode.')
    .action(async (_, command: Command) => {
      await startProject(command.getOptionValue('watch'));
    });
}
