import { Command } from 'commander';
import { runTask } from './run-task';

/**
 * Registers the `run` command, running a one-shot task with the application.
 *
 * @param {Command} program - The program to register the command on.
 */
export function runCommand(program: Command): void {
  program
    .command('run')
    .alias('r')
    .description(
      'Run the default export of a file with the application, without starting its server, then exit.'
    )
    .argument('<file>', 'The task file, i.e. src/tasks/report.ts.')
    .argument('[args...]', 'The arguments passed to the task.')
    .action(async (file: string, args: string[]) => {
      try {
        process.exit(await runTask(file, args));
      } catch (error) {
        console.error('Task failed', error);
        process.exit(1);
      }
    });
}
