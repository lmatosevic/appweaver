import { Command } from 'commander';
import { buildProject } from './build-project';

/**
 * Registers the `build` command, building the application.
 *
 * @param {Command} program - The program to register the command on.
 */
export function buildCommand(program: Command): void {
  program
    .command('build')
    .alias('b')
    .description('Build the application.')
    .option(
      '-p, --project [path]',
      'TypeScript project config file.',
      'tsconfig.build.json'
    )
    .action(async (_, command: Command) => {
      const projectFile = command.getOptionValue('project');

      process.exit(await buildProject(projectFile));
    });
}
