import { EventEmitter } from 'node:events';
import childProcess from 'node:child_process';
import { importPackage } from '../../utils/package-util';
import { runScript, runTool } from '../../tooling/run-tool';

jest.mock('../../utils/package-util', () => ({
  importPackage: jest.fn(async () => ({
    toolBin: (tool: string) => `/tooling/${tool}.js`
  }))
}));

describe('run-tool', () => {
  let spawn: jest.SpyInstance;
  let child: EventEmitter;

  beforeEach(() => {
    child = new EventEmitter();
    spawn = jest
      .spyOn(childProcess, 'spawn')
      .mockImplementation(() => child as childProcess.ChildProcess);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('runTool', () => {
    test('runs the script of the tool with node in the project', async () => {
      const result = runTool('eslint', ['.'], 'lint', { A: '1' });
      await new Promise(setImmediate);
      child.emit('close', 2);

      await expect(result).resolves.toBe(2);
      expect(importPackage).toHaveBeenCalledWith('@appweaver/tooling', 'lint');
      expect(spawn).toHaveBeenCalledWith(
        process.execPath,
        ['/tooling/eslint.js', '.'],
        expect.objectContaining({
          cwd: process.cwd(),
          stdio: 'inherit',
          env: expect.objectContaining({ A: '1' })
        })
      );
    });
  });

  describe('runScript', () => {
    test('resolves 1 when a signal ends the process', async () => {
      const result = runScript('bun', ['test']);
      child.emit('close', null);

      await expect(result).resolves.toBe(1);
    });

    test('rejects when the executable cannot start', async () => {
      const result = runScript('bun', ['test']);
      child.emit('error', new Error('ENOENT'));

      await expect(result).rejects.toThrow('ENOENT');
    });
  });
});
