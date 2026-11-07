import fs from 'node:fs';
import path from 'node:path';
import {
  appConfig,
  importModule,
  isTypeScriptRuntime,
  resolveSourcePath
} from '@appweaver/common';
import { Task, createTask, isTask } from '@appweaver/core';
import { context } from '@appweaver/core/internal';

/** A task found by `weaver run`. */
export type LoadedTask = {
  name: string;
  /** The absolute path of its file. */
  file: string;
  task: Task;
  /** The module declaring it, none for a task of the application. */
  module?: string;
};

/** The tasks of the application and of the enabled modules, with the files failing to load. */
export type TaskList = {
  tasks: LoadedTask[];
  failed: { file: string; error: Error }[];
};

/** Fails a task before it runs, reported by its message alone. */
export class TaskError extends Error {}

const scriptPattern = /\.[cm]?[jt]s$/;
const declarationPattern = /\.d\.[cm]?ts$/;

/**
 * Checks if `weaver run` was given a file instead of a task name: a path with a directory or a script extension.
 *
 * @param {string} target - The task name or file.
 * @return {boolean} `true` for a file path.
 */
export function isTaskPath(target: string): boolean {
  return /[\\/]/.test(target) || scriptPattern.test(target);
}

/**
 * Resolves the file of a task for the current runtime, a source file running from the build output on Node, i.e.
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
 * The tasks directory of the application for the current runtime, `dist/src/tasks` on Node.
 *
 * @return {string} The absolute path of the directory.
 */
export function appTasksDir(): string {
  return resolveSourcePath(appConfig.BUILD_PATH, appConfig.TASKS_DIR_PATH);
}

/**
 * The name of a task from its path in the tasks directory, i.e. `reports/daily.ts` is `reports:daily`.
 *
 * @param {string} relativePath - The path of the file relative to the tasks directory.
 * @return {string} The name of the task.
 */
export function taskName(relativePath: string): string {
  return relativePath.replace(scriptPattern, '').split(/[\\/]/).join(':');
}

/**
 * Loads the task of a file given to `weaver run`.
 *
 * @param {string} filePath - The path of the file, relative to the project root.
 * @return {Promise<LoadedTask>} The task.
 * @throws {TaskError} When the file exports no task.
 */
export async function loadTaskFile(filePath: string): Promise<LoadedTask> {
  const file = resolveTaskPath(filePath);
  const { value } = await importModule(file, true);
  const loaded = toLoadedTask(value, file, taskName(path.basename(file)));
  if (!loaded) {
    throw new TaskError(
      `The file ${filePath} exports no task or default function`
    );
  }
  return loaded;
}

/**
 * Loads the tasks of the enabled modules (their `tasks` directory), then of the application (`app.tasksDirPath`). A
 * task of the application replaces the task of a module with the same name.
 *
 * @return {Promise<TaskList>} The tasks sorted by name, and the files failing to load.
 * @throws {TaskError} For two tasks with the same name.
 */
export async function loadTasks(): Promise<TaskList> {
  const tasks = new Map<string, LoadedTask>();
  const failed: TaskList['failed'] = [];
  const sources: { dir: string; module?: string }[] = [
    ...context.modules.enabled.flatMap((module) =>
      module.tasks ? [{ dir: module.tasks, module: module.name }] : []
    ),
    { dir: appTasksDir() }
  ];

  for (const { dir, module } of sources) {
    for (const file of taskFiles(dir)) {
      const { value, error } = await importModule(file);
      if (error) {
        failed.push({ file, error });
        continue;
      }
      const loaded = toLoadedTask(
        value,
        file,
        taskName(path.relative(dir, file)),
        module
      );
      if (!loaded) {
        // A helper of the tasks
        continue;
      }
      const existing = tasks.get(loaded.name);
      if (existing && (module || !existing.module)) {
        throw new TaskError(
          `The task ${loaded.name} is defined by both ${existing.file} and ${file}`
        );
      }
      tasks.set(loaded.name, loaded);
    }
  }

  return {
    tasks: [...tasks.values()].sort((a, b) => a.name.localeCompare(b.name)),
    failed
  };
}

/**
 * Finds a task by its name.
 *
 * @param {string} name - The name of the task.
 * @return {Promise<LoadedTask>} The task.
 * @throws {TaskError} When no task has the name, suggesting the names containing it.
 */
export async function findTask(name: string): Promise<LoadedTask> {
  const { tasks, failed } = await loadTasks();
  const task = tasks.find((task) => task.name === name);
  if (task) {
    return task;
  }

  const similar = tasks.filter((task) => task.name.includes(name));
  const lines = [`No task ${name}`];
  if (similar.length > 0) {
    lines.push(`Did you mean ${similar.map((t) => t.name).join(', ')}?`);
  }
  for (const { file, error } of failed) {
    lines.push(`The file ${file} failed to load: ${error.message}`);
  }
  lines.push('Run weaver run to list the tasks.');
  throw new TaskError(lines.join('\n'));
}

/** The task of a default export, a plain function made a task receiving the raw arguments. */
function toLoadedTask(
  value: unknown,
  file: string,
  name: string,
  module?: string
): LoadedTask | undefined {
  if (isTask(value)) {
    return { name: value.name || name, file, task: value, module };
  }
  if (typeof value === 'function') {
    const task = createTask({ run: ({ argv }) => value(argv) });
    return { name, file, task, module };
  }
  return undefined;
}

/** The script files of a tasks directory and its subdirectories. */
function taskFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(
      (file) => scriptPattern.test(file) && !declarationPattern.test(file)
    )
    .map((file) => path.join(dir, file))
    .sort();
}
