import { Command } from 'commander';
import { runProcess } from '../utils';

export function startCommand(program: Command): void {
  program
    .command('start')
    .alias('s')
    .description('Start the application')
    .option('-w, --watch', 'Run in watch mode.')
    .action(async (_, command: Command) => {
      if (command.getOptionValue('watch')) {
        await runProcess('tsc-watch', [
          '-p tsconfig.build.json',
          '--onCompilationComplete "tsc-alias -p tsconfig.build.json"',
          '--onSuccess "node ./dist/main.js"'
        ]);
      } else {
        await runProcess('node', ['./dist/main.js']);
      }
    });
}
