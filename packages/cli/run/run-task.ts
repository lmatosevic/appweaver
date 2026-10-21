import path from 'node:path';
import {
  appConfig,
  configOverrides,
  importModule,
  isTypeScriptRuntime
} from '@appweaver/common';
import { createApp } from '@appweaver/core';

/** The default export of a task file, receiving the arguments given after the file. */
export type Task = (args: string[]) => unknown;

/**
 * Resolves the file of a task for the current runtime: a source file runs from the build output on Node, i.e.
 * `src/tasks/report.ts` from `dist/src/tasks/report.js`.
 *
 * @param {string} filePath - The path of the task file, relative to the project root.
 * @return {string} The absolute path of the file to run.
 */
export function resolveTaskPath(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  if (isTypeScriptRuntime() || !absolutePath.endsWith('.ts')) {
    return absolutePath;
  }
  return path
    .resolve(appConfig.BUILD_PATH, path.relative(process.cwd(), absolutePath))
    .replace(/\.ts$/, '.js');
}

/**
 * Runs a one-shot task: creates the application without starting its server or its scheduled jobs, runs the default
 * export of the file with the arguments, and stops the application.
 *
 * @param {string} filePath - The path of the task file.
 * @param {string[]} args - The arguments passed to the task.
 * @return {Promise<number>} The exit code: the number the task returns, otherwise `0`.
 */
export async function runTask(
  filePath: string,
  args: string[]
): Promise<number> {
  configOverrides.SCHEDULER_AUTO_START_JOB = false;
  configOverrides.SERVER_LISTEN = false;
  // The application the task runs in may already listen on the health port
  configOverrides.HEALTH_CHECK_PORT = 0;

  const app = await createApp();

  try {
    const { value: task, error } = await importModule<Task>(
      resolveTaskPath(filePath),
      true
    );
    if (error || typeof task !== 'function') {
      throw new Error(`The file ${filePath} exports no default function`);
    }

    const result = await task(args);
    return typeof result === 'number' ? result : 0;
  } finally {
    await app.stop();
  }
}
