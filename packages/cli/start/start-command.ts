import { Command } from 'commander';
import { startProject } from './start-project';

/**
 * Registers the `start` command, starting the application.
 *
 * @param {Command} program - The program to register the command on.
 */
export function startCommand(program: Command): void {
  program
    .command('start')
    .alias('s')
    .description('Start the application.')
    .option(
      '-p, --project [path]',
      'TypeScript project config file.',
      'tsconfig.build.json'
    )
    .option('-w, --watch', 'Run in watch mode.')
    .action(async (_, command: Command) => {
      const projectFile = command.getOptionValue('project');
      const watch = command.getOptionValue('watch');

      await startProject(projectFile, watch);
    });
}
