// fkill is an ESM only package that cannot be loaded by the CommonJS test
// runtime, so process killing is stubbed and asserted through the mock.
jest.mock('fkill', () => ({
  __esModule: true,
  default: jest.fn(async (pid: number) => {
    try {
      process.kill(pid);
    } catch {
      // the process already exited
    }
  })
}));

import fkill from 'fkill';
import { config } from '@appweaver/common';
import {
  assertEnv,
  assertEnvs,
  isBunProcess,
  runProcess
} from '../../utils/process-util';

describe('process-util', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('runProcess', () => {
    test('resolves with the exit code of a successful command', async () => {
      await expect(
        runProcess('node', ['-e', '"process.exit(0)"'], { quiet: true })
      ).resolves.toBe(0);
    });

    test('resolves with a non zero exit code for a failing command', async () => {
      await expect(
        runProcess('node', ['-e', '"process.exit(3)"'], { quiet: true })
      ).resolves.toBe(3);
    });

    test('runs a command without arguments', async () => {
      await expect(
        runProcess('node --version', [], { quiet: true })
      ).resolves.toBe(0);
    });

    test('resolves immediately when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        runProcess('node', ['-e', '"process.exit(5)"'], {
          quiet: true,
          signal: controller.signal
        })
      ).resolves.toBe(0);
    });

    test('kills the running process and resolves with 0 on abort', async () => {
      const controller = new AbortController();

      const promise = runProcess(
        'node',
        ['-e', '"setTimeout(() => process.exit(7), 1000)"'],
        { quiet: true, signal: controller.signal }
      );

      setTimeout(() => controller.abort(), 200);

      await expect(promise).resolves.toBe(0);
      expect(fkill).toHaveBeenCalledWith(expect.any(Number), {
        force: true,
        tree: true
      });
    }, 30000);
  });

  describe('assertEnv', () => {
    test('does nothing when the environment matches', () => {
      const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      expect(() =>
        assertEnv(config.APP_ENV, 'Wrong environment')
      ).not.toThrow();
      expect(exit).not.toHaveBeenCalled();
    });

    test('logs the message and exits when the environment differs', () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      expect(() => assertEnv('other-env', 'Wrong environment')).toThrow(
        'process.exit called'
      );
      expect(error).toHaveBeenCalledWith('Wrong environment');
      expect(exit).toHaveBeenCalledWith(1);
    });
  });

  describe('assertEnvs', () => {
    test('does nothing when the environment is in the list', () => {
      const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      expect(() =>
        assertEnvs(['other-env', config.APP_ENV], 'Wrong environment')
      ).not.toThrow();
      expect(exit).not.toHaveBeenCalled();
    });

    test('logs the message and exits when no environment matches', () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      expect(() =>
        assertEnvs(['other-env', 'another-env'], 'Wrong environment')
      ).toThrow('process.exit called');
      expect(error).toHaveBeenCalledWith('Wrong environment');
      expect(exit).toHaveBeenCalledWith(1);
    });

    test('exits for an empty list of environments', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      expect(() => assertEnvs([], 'Wrong environment')).toThrow(
        'process.exit called'
      );
      expect(exit).toHaveBeenCalledWith(1);
    });
  });

  describe('isBunProcess', () => {
    test('returns false when the Bun global is not defined', () => {
      expect(isBunProcess()).toBe(false);
    });

    test('returns true when the Bun global is defined', () => {
      (globalThis as any).Bun = { version: '1.0.0' };
      try {
        expect(isBunProcess()).toBe(true);
      } finally {
        delete (globalThis as any).Bun;
      }
    });
  });
});
