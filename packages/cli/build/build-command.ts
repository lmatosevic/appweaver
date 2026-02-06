import { spawn } from 'node:child_process';
import { Command } from 'commander';

export function buildCommand(program: Command): void {
  program
    .command('build')
    .alias('b')
    .description('Build the application')
    .action(() => {
      spawn('tsc -p tsconfig.build.json', { stdio: 'inherit', shell: true });
    });
}
