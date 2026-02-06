import { Command } from 'commander';
import { spawn } from 'node:child_process';

export function startCommand(program: Command): void {
  program
    .command('start')
    .alias('s')
    .description('Start the application')
    .option('-w, --watch', 'Run in watch mode.')
    .action(async (app: string, options: Command) => {
      if (options.getOptionValue('watch')) {
        spawn(
          'tsc-watch -p tsconfig.build.json --onSuccess "node ./dist/main.js"',
          { stdio: 'inherit', shell: true }
        );
      } else {
        spawn('node ./dist/main.js', { stdio: 'inherit', shell: true });
      }
    });
}
