import { Command } from 'commander';
import { TaskError } from './load-tasks';
import { listTasks, runTask } from './run-task';

/**
 * Registers the `run` command, running a one-shot task with the application, or listing the tasks without one.
 *
 * @param {Command} program - The program to register the command on.
 */
export function runCommand(program: Command): void {
  // The options after the task are passed to it
  program.enablePositionalOptions();

  program
    .command('run')
    .alias('r')
    .description(
      'Run a task with the application, without starting its server, then exit. Lists the tasks without a task.'
    )
    .argument(
      '[task]',
      'Task name or file, i.e. reports:daily or src/tasks/report.ts.'
    )
    .argument('[args...]', 'Arguments and options passed to the task.')
    .passThroughOptions()
    .action(async (task: string | undefined, args: string[]) => {
      try {
        if (!task) {
          console.log(await listTasks());
          process.exit(0);
        }
        process.exit(await runTask(task, args));
      } catch (error) {
        if (error instanceof TaskError) {
          console.error(error.message);
        } else {
          console.error('Task failed', error);
        }
        process.exit(1);
      }
    });
}
