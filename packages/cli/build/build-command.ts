import { Command } from 'commander';
import { buildProject } from './build-project';

export function buildCommand(program: Command): void {
  program
    .command('build')
    .alias('b')
    .description('Build the application.')
    .action(async () => {
      process.exit(await buildProject());
    });
}
