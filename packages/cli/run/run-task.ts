import path from 'node:path';
import { configOverrides } from '@appweaver/common';
import { createApp } from '@appweaver/core';
import {
  TaskList,
  appTasksDir,
  findTask,
  isTaskPath,
  loadTaskFile,
  loadTasks
} from './load-tasks';
import { parseTaskArgs } from './parse-task-args';

/**
 * Runs a task by its name or its file: creates the application without starting its server or its scheduled jobs,
 * parses the arguments, then starts the application for the task and stops it. Invalid arguments and `--help` exit
 * before the application starts.
 *
 * @param {string} target - The name of the task, or the path of its file.
 * @param {string[]} argv - The arguments given after the task.
 * @return {Promise<number>} The exit code: the number the task returns, otherwise `0`.
 */
export async function runTask(target: string, argv: string[]): Promise<number> {
  const app = await createTaskApp();
  const { name, task } = isTaskPath(target)
    ? await loadTaskFile(target)
    : await findTask(target);

  const parsed = parseTaskArgs(name, task, argv);
  if ('exitCode' in parsed) {
    return parsed.exitCode;
  }

  await app.start();
  try {
    const result = await task.run(parsed.context);
    return typeof result === 'number' ? result : 0;
  } finally {
    await app.stop();
  }
}

/**
 * Lists the tasks of the application and of the enabled modules with their descriptions.
 *
 * @return {Promise<string>} The text of the list.
 */
export async function listTasks(): Promise<string> {
  await createTaskApp();
  return formatTasks(await loadTasks());
}

/**
 * Formats the tasks like `weaver run` prints them.
 *
 * @param {TaskList} list - The tasks and the files failing to load.
 * @return {string} The text of the list.
 */
export function formatTasks({ tasks, failed }: TaskList): string {
  const lines = ['Usage: weaver run <task> [args...]', ''];
  if (tasks.length === 0) {
    lines.push(`No tasks in ${path.relative(process.cwd(), appTasksDir())}`);
  } else {
    const width = Math.max(...tasks.map((task) => task.name.length));
    lines.push('Tasks:');
    for (const { name, task, module } of tasks) {
      const description = [task.description, module && `[${module}]`];
      lines.push(
        `  ${name.padEnd(width)}  ${description.filter(Boolean).join(' ')}`.trimEnd()
      );
    }
  }
  for (const { file, error } of failed) {
    lines.push('', `The file ${file} failed to load: ${error.message}`);
  }
  lines.push('', 'Run weaver run <task> --help for the usage of a task.');
  return lines.join('\n');
}

/** Creates the application of a task, without starting its server, its health listener or its scheduled jobs. */
async function createTaskApp() {
  configOverrides.SCHEDULER_AUTO_START_JOB = false;
  configOverrides.SERVER_LISTEN = false;
  // The application the task runs in may already listen on the health port
  configOverrides.HEALTH_CHECK_PORT = 0;
  return createApp({ autoStart: false });
}
