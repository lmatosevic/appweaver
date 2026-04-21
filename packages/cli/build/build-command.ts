import { Command } from 'commander';
import { buildProject } from './build-project';

export function buildCommand(program: Command): void {
  program
    .command('build')
    .alias('b')
    .description('Build the application.')
    .option(
      '-p, --project [path]',
      'TypeScript project build config file.',
      'tsconfig.build.json'
    )
    .action(async (_, command: Command) => {
      const projectFile = command.getOptionValue('project');

      process.exit(await buildProject(projectFile));
    });
}
