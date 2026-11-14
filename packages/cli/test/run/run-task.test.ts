const app = {
  start: jest.fn(async () => undefined),
  stop: jest.fn(async () => undefined)
};
jest.mock('@appweaver/core', () => ({
  ...jest.requireActual('@appweaver/core'),
  createApp: jest.fn(async () => app)
}));

import path from 'node:path';
import { configOverrides } from '@appweaver/common';
import { createApp, createTask } from '@appweaver/core';
import { recordTelemetry } from '@appweaver/testing';
import { formatTasks, listTasks, runTask } from '../../run';

const fixtures = path.join(__dirname, 'fixtures');

const fixture = (name: string) =>
  path.relative(process.cwd(), path.join(fixtures, name));

/** Runs a task, capturing what it and its command write. */
async function run(target: string, argv: string[]) {
  const output: string[] = [];
  const capture = (text: unknown) => !!output.push(String(text));
  const spies = [
    jest.spyOn(process.stdout, 'write').mockImplementation(capture),
    jest.spyOn(process.stderr, 'write').mockImplementation(capture),
    jest.spyOn(console, 'log').mockImplementation(capture)
  ];
  try {
    return { code: await runTask(target, argv), output: output.join('') };
  } finally {
    spies.forEach((spy) => spy.mockRestore());
  }
}

describe('run-task', () => {
  beforeEach(() => {
    configOverrides.APP_BUILD_PATH = '.';
    configOverrides.APP_TASKS_DIR_PATH = fixture('app/tasks');
  });

  afterEach(() => {
    jest.clearAllMocks();
    for (const key of [
      'APP_BUILD_PATH',
      'APP_TASKS_DIR_PATH',
      'SCHEDULER_AUTO_START_JOB',
      'SERVER_LISTEN',
      'HEALTH_CHECK_PORT'
    ]) {
      delete configOverrides[key];
    }
  });

  describe('runTask', () => {
    test('runs the default function of a file with the started application, then stops it', async () => {
      const { code } = await run(fixture('sum-task.js'), ['1', '2']);

      expect(code).toBe(3);
      expect(createApp).toHaveBeenCalledWith({ autoStart: false });
      expect(app.start).toHaveBeenCalled();
      expect(app.stop).toHaveBeenCalled();
      expect(configOverrides.SCHEDULER_AUTO_START_JOB).toBe(false);
      expect(configOverrides.SERVER_LISTEN).toBe(false);
      expect(configOverrides.HEALTH_CHECK_PORT).toBe(0);
    });

    test('runs the task in the root span of a trace', async () => {
      const telemetry = recordTelemetry();

      await run('greet', ['Ana']);

      const span = telemetry.span('task greet');
      expect(span.parentSpanContext).toBeUndefined();
      expect(span.attributes).toEqual({ 'appweaver.task.name': 'greet' });
      await telemetry.stop();
    });

    test('runs the task without a span with the instrumentation off', async () => {
      const telemetry = recordTelemetry();
      configOverrides.TELEMETRY_INSTRUMENTATIONS_TASK = false;

      const { code } = await run(fixture('sum-task.js'), ['1', '2']);

      expect(code).toBe(3);
      expect(telemetry.spans()).toHaveLength(0);
      delete configOverrides.TELEMETRY_INSTRUMENTATIONS_TASK;
      await telemetry.stop();
    });

    test('runs a task by its name with the parsed arguments', async () => {
      const { code, output } = await run('greet', [
        'Ana',
        '2',
        '--greeting',
        'hi',
        '--loud'
      ]);

      expect(code).toBe(2);
      expect(output).toContain('HI ANAHI ANA');
      expect(app.stop).toHaveBeenCalled();
    });

    test('runs a task of a file with the parsed arguments', async () => {
      const { code } = await run(fixture('app/tasks/greet.js'), ['Ana']);

      expect(code).toBe(1);
    });

    test('exits with 0 for a task returning no number', async () => {
      configOverrides.APP_TASKS_DIR_PATH = fixture('module/tasks');

      expect((await run('billing:sync', [])).code).toBe(0);
    });

    test('shows the help of a task without starting the application', async () => {
      const { code, output } = await run('greet', ['--help']);

      expect(code).toBe(0);
      expect(output).toContain('Usage: weaver run greet [options] <name>');
      expect(app.start).not.toHaveBeenCalled();
    });

    test('fails for invalid arguments without starting the application', async () => {
      const { code, output } = await run('greet', []);

      expect(code).toBe(1);
      expect(output).toContain("missing required argument 'name'");
      expect(app.start).not.toHaveBeenCalled();
    });

    test('stops the application when the task throws', async () => {
      await expect(run(fixture('failing-task.js'), [])).rejects.toThrow(
        'Task error'
      );
      expect(app.start).toHaveBeenCalled();
      expect(app.stop).toHaveBeenCalled();
    });

    test('fails for a file without a task', async () => {
      await expect(run(fixture('no-task.js'), [])).rejects.toThrow(
        'exports no task or default function'
      );
      expect(app.start).not.toHaveBeenCalled();
    });
  });

  describe('listTasks', () => {
    test('lists the tasks with their descriptions', async () => {
      const text = await listTasks();

      expect(createApp).toHaveBeenCalledWith({ autoStart: false });
      expect(app.start).not.toHaveBeenCalled();
      expect(text.split('\n')).toEqual([
        'Usage: weaver run <task> [args...]',
        '',
        'Tasks:',
        '  greet          Greets someone.',
        '  legacy',
        '  reports:daily  Builds the daily reports.',
        '',
        `The file ${path.join(fixtures, 'app/tasks/broken.js')} failed to load: Broken task`,
        '',
        'Run weaver run <task> --help for the usage of a task.'
      ]);
    });
  });

  describe('formatTasks', () => {
    test('names the module of a task', () => {
      const text = formatTasks({
        tasks: [
          {
            name: 'billing:sync',
            file: 'sync.js',
            task: createTask({ description: 'Syncs.', run: () => 0 }),
            module: '@acme/billing'
          }
        ],
        failed: []
      });

      expect(text).toContain('  billing:sync  Syncs. [@acme/billing]');
    });

    test('reports a directory without tasks', () => {
      expect(formatTasks({ tasks: [], failed: [] })).toContain(
        `No tasks in ${fixture('app/tasks')}`
      );
    });
  });
});
