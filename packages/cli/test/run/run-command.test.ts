jest.mock('../../run/run-task', () => ({
  listTasks: jest.fn(async () => 'Tasks:'),
  runTask: jest.fn(async () => 3)
}));

import { Command } from 'commander';
import { TaskError, listTasks, runCommand, runTask } from '../../run';

/** Parses the arguments of `weaver run`, resolving the exit code. */
async function weaverRun(...args: string[]): Promise<number> {
  const program = new Command('weaver');
  runCommand(program);
  return new Promise((resolve) => {
    jest
      .spyOn(process, 'exit')
      .mockImplementation(((code: number) => resolve(code)) as never);
    void program.parseAsync(['run', ...args], { from: 'user' });
  });
}

describe('run-command', () => {
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('runCommand', () => {
    test('lists the tasks without a task', async () => {
      expect(await weaverRun()).toBe(0);
      expect(listTasks).toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith('Tasks:');
    });

    test('runs a task named list', async () => {
      expect(await weaverRun('list')).toBe(3);
      expect(runTask).toHaveBeenCalledWith('list', []);
      expect(listTasks).not.toHaveBeenCalled();
    });

    test('runs a task with the options after it, exiting with its code', async () => {
      expect(await weaverRun('report', '2026-10', '--help', '-v')).toBe(3);
      expect(runTask).toHaveBeenCalledWith('report', [
        '2026-10',
        '--help',
        '-v'
      ]);
    });

    test('reports a task not found by its message alone', async () => {
      jest
        .mocked(runTask)
        .mockRejectedValueOnce(new TaskError('No task report'));

      expect(await weaverRun('report')).toBe(1);
      expect(error).toHaveBeenCalledWith('No task report');
    });

    test('reports a failed task with its error', async () => {
      const failure = new Error('Broken');
      jest.mocked(runTask).mockRejectedValueOnce(failure);

      expect(await weaverRun('report')).toBe(1);
      expect(error).toHaveBeenCalledWith('Task failed', failure);
    });
  });
});
