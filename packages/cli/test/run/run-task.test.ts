const app = {
  start: jest.fn(async () => undefined),
  stop: jest.fn(async () => undefined)
};
jest.mock('@appweaver/core', () => ({
  createApp: jest.fn(async () => app)
}));

import path from 'node:path';
import { configOverrides } from '@appweaver/common';
import { createApp } from '@appweaver/core';
import { resolveTaskPath, runTask } from '../../run';

const fixture = (name: string) =>
  path.relative(process.cwd(), path.join(__dirname, 'fixtures', name));

describe('run-task', () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete configOverrides.SCHEDULER_AUTO_START_JOB;
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

  describe('runTask', () => {
    test('runs the task with the started application, then stops it', async () => {
      const code = await runTask(fixture('sum-task.js'), ['1', '2']);

      expect(code).toBe(3);
      expect(createApp).toHaveBeenCalled();
      expect(app.stop).toHaveBeenCalled();
      expect(configOverrides.SCHEDULER_AUTO_START_JOB).toBe(false);
      expect(configOverrides.SERVER_LISTEN).toBe(false);
      expect(configOverrides.HEALTH_CHECK_PORT).toBe(0);
    });

    test('fails for a file without a default function, stopping the application', async () => {
      await expect(runTask(fixture('no-task.js'), [])).rejects.toThrow(
        'exports no default function'
      );
      expect(app.stop).toHaveBeenCalled();
    });
  });
});
