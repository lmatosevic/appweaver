import path from 'node:path';
import { configOverrides, defineModule } from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import { isTask } from '@appweaver/core';
import { resetContext } from '@appweaver/testing';
import {
  TaskError,
  appTasksDir,
  findTask,
  isTaskPath,
  loadTaskFile,
  loadTasks,
  resolveTaskPath,
  taskName
} from '../../run';

const fixtures = path.join(__dirname, 'fixtures');

/** Points the tasks directory of the application at a fixture directory. */
function useAppTasks(name: string): void {
  configOverrides.APP_BUILD_PATH = '.';
  configOverrides.APP_TASKS_DIR_PATH = path.relative(
    process.cwd(),
    path.join(fixtures, name, 'tasks')
  );
}

/** Enables a module declaring the tasks of the fixture module. */
function enableModule(): void {
  context.modules.enabled.push(
    defineModule({
      name: '@acme/billing',
      tasks: path.join(fixtures, 'module', 'tasks')
    })
  );
}

describe('load-tasks', () => {
  afterEach(() => {
    resetContext();
    delete configOverrides.APP_BUILD_PATH;
    delete configOverrides.APP_TASKS_DIR_PATH;
  });

  describe('isTaskPath', () => {
    test('takes a path with a directory or a script extension as a file', () => {
      expect(isTaskPath('src/tasks/report.ts')).toBe(true);
      expect(isTaskPath('src\\tasks\\report.ts')).toBe(true);
      expect(isTaskPath('report.js')).toBe(true);
      expect(isTaskPath('report.mts')).toBe(true);
    });

    test('takes anything else as a task name', () => {
      expect(isTaskPath('report')).toBe(false);
      expect(isTaskPath('reports:daily')).toBe(false);
    });
  });

  describe('resolveTaskPath', () => {
    test('runs a source file from the build output on Node', () => {
      expect(resolveTaskPath('src/tasks/report.ts')).toBe(
        path.resolve('dist/src/tasks/report.js')
      );
    });

    test('keeps a JavaScript file as it is', () => {
      expect(resolveTaskPath('dist/src/tasks/report.js')).toBe(
        path.resolve('dist/src/tasks/report.js')
      );
    });
  });

  describe('appTasksDir', () => {
    test('reads the tasks of the application from the build output on Node', () => {
      expect(appTasksDir()).toBe(path.resolve('dist/src/tasks'));
    });
  });

  describe('taskName', () => {
    test('names a task after its file, separating the directories with a colon', () => {
      expect(taskName('report.js')).toBe('report');
      expect(taskName(path.join('reports', 'daily.ts'))).toBe('reports:daily');
      expect(taskName('reports/monthly/summary.mjs')).toBe(
        'reports:monthly:summary'
      );
    });
  });

  describe('loadTaskFile', () => {
    test('loads the default function of a file as a task receiving the raw arguments', async () => {
      const { name, task } = await loadTaskFile(
        path.relative(process.cwd(), path.join(fixtures, 'sum-task.js'))
      );

      expect(name).toBe('sum-task');
      expect(isTask(task)).toBe(true);
      await expect(
        task.run({ args: {}, options: {}, argv: ['1', '2'] })
      ).resolves.toBe(3);
    });

    test('names a created task by its name', async () => {
      const task = await loadTaskFile(
        path.join(fixtures, 'module', 'tasks', 'sync.js')
      );

      expect(task.name).toBe('billing:sync');
    });

    test('fails for a file without a task', async () => {
      await expect(
        loadTaskFile(path.join(fixtures, 'no-task.js'))
      ).rejects.toThrow(TaskError);
    });
  });

  describe('loadTasks', () => {
    test('loads the tasks of the application by their names, skipping the helpers', async () => {
      useAppTasks('app');

      const { tasks, failed } = await loadTasks();

      expect(tasks.map(({ name, module }) => [name, module])).toEqual([
        ['greet', undefined],
        ['legacy', undefined],
        ['reports:daily', undefined]
      ]);
      expect(failed).toEqual([
        {
          file: path.join(fixtures, 'app', 'tasks', 'broken.js'),
          error: expect.objectContaining({ message: 'Broken task' })
        }
      ]);
    });

    test('loads the tasks of the modules, replaced by a task of the application', async () => {
      useAppTasks('app');
      enableModule();

      const { tasks } = await loadTasks();

      expect(tasks.map(({ name, module }) => [name, module])).toEqual([
        ['billing:sync', '@acme/billing'],
        ['greet', undefined],
        ['legacy', undefined],
        ['reports:daily', undefined]
      ]);
    });

    test('finds no tasks without a tasks directory', async () => {
      useAppTasks('missing');

      expect(await loadTasks()).toEqual({ tasks: [], failed: [] });
    });

    test('fails for two tasks with the same name', async () => {
      useAppTasks('duplicate');

      await expect(loadTasks()).rejects.toThrow(
        /The task same is defined by both .*first\.js and .*second\.js/
      );
    });

    test('loads a task named list like any other', async () => {
      useAppTasks('named-list');

      const { tasks } = await loadTasks();

      expect(tasks.map(({ name }) => name)).toEqual(['list']);
    });
  });

  describe('findTask', () => {
    test('finds a task by its name', async () => {
      useAppTasks('app');

      const task = await findTask('reports:daily');

      expect(task.file).toBe(
        path.join(fixtures, 'app', 'tasks', 'reports', 'daily.js')
      );
    });

    test('fails for an unknown name, suggesting the similar names and the failed files', async () => {
      useAppTasks('app');

      const error = await findTask('daily').catch((e: Error) => e);

      expect(error).toBeInstanceOf(TaskError);
      expect((error as Error).message).toMatch(
        /^No task daily\nDid you mean reports:daily\?\nThe file .*broken\.js failed to load: Broken task\nRun weaver run to list the tasks\.$/
      );
    });

    test('fails for an unknown name without similar names', async () => {
      useAppTasks('missing');

      await expect(findTask('report')).rejects.toThrow(
        'No task report\nRun weaver run to list the tasks.'
      );
    });
  });
});
