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
      '-w, --watch',
      'Run in watch mode, rebuilding and restarting on every change.'
    )
    .option(
      '-p, --project <path>',
      'TypeScript project config file of the watch mode.',
      'tsconfig.build.json'
    )
    .action(async (_, command: Command) => {
      const projectFile = command.getOptionValue('project');
      const watch = command.getOptionValue('watch');

      await startProject(projectFile, watch);
    });
}
