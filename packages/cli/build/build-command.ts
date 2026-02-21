import { Command } from 'commander';
import { runProcess } from '../utils';

export function buildCommand(program: Command): void {
  program
    .command('build')
    .alias('b')
    .description('Build the application')
    .action(async () => {
      await runProcess('rimraf', ['dist']);
      await runProcess('tsc', ['-p tsconfig.build.json']);
      await runProcess('tsc-alias', ['-p tsconfig.build.json']);
    });
}
