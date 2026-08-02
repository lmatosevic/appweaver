const runProcess = jest.fn<Promise<number>, any[]>();
const isBunProcess = jest.fn<boolean, []>();

jest.mock('../../utils', () => ({
  runProcess: (...args: any[]) => runProcess(...args),
  isBunProcess: () => isBunProcess()
}));

import { updatePackages } from '../../update/update-packages';

describe('update-packages', () => {
  const originalRuntime = process.env.APP_RUNTIME;

  beforeEach(() => {
    runProcess.mockReset();
    runProcess.mockResolvedValue(0);
    isBunProcess.mockReset();
    isBunProcess.mockReturnValue(false);
  });

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.APP_RUNTIME;
    } else {
      process.env.APP_RUNTIME = originalRuntime;
    }
    jest.resetModules();
  });

  describe('updatePackages', () => {
    test('installs the packages with the requested version using npm', async () => {
      const status = await updatePackages(
        ['@appweaver/core', '@appweaver/cli'],
        '1.2.3'
      );

      expect(status).toBe(0);
      expect(runProcess).toHaveBeenCalledWith(
        'npm',
        ['install', '@appweaver/core@1.2.3', '@appweaver/cli@1.2.3'],
        { quiet: true }
      );
    });

    test('supports the latest version tag', async () => {
      await updatePackages(['@appweaver/core'], 'latest');

      expect(runProcess).toHaveBeenCalledWith(
        'npm',
        ['install', '@appweaver/core@latest'],
        { quiet: true }
      );
    });

    test('adds the legacy peer deps flag when forced', async () => {
      await updatePackages(['@appweaver/core'], '1.2.3', true);

      expect(runProcess).toHaveBeenCalledWith(
        'npm',
        ['install', '@appweaver/core@1.2.3', '--legacy-peer-deps'],
        { quiet: true }
      );
    });

    test('passes the quiet flag through to the process', async () => {
      await updatePackages(['@appweaver/core'], '1.2.3', false, false);

      expect(runProcess).toHaveBeenCalledWith('npm', expect.any(Array), {
        quiet: false
      });
    });

    test('returns the exit code of a failed installation', async () => {
      runProcess.mockResolvedValue(1);

      await expect(updatePackages(['@appweaver/core'], '1.2.3')).resolves.toBe(
        1
      );
    });

    test('runs an install without packages', async () => {
      await updatePackages([], 'latest');

      expect(runProcess).toHaveBeenCalledWith('npm', ['install'], {
        quiet: true
      });
    });

    test('uses bun add when running the Bun runtime', async () => {
      process.env.APP_RUNTIME = 'bun';
      isBunProcess.mockReturnValue(true);
      jest.resetModules();

      const { updatePackages: bunUpdatePackages } =
        await import('../../update/update-packages');
      await bunUpdatePackages(['@appweaver/core'], '1.2.3', true);

      expect(runProcess).toHaveBeenCalledWith(
        'bun',
        ['add', '@appweaver/core@1.2.3'],
        { quiet: true }
      );
    });

    test('uses npm when the Bun runtime is configured but not running Bun', async () => {
      process.env.APP_RUNTIME = 'bun';
      isBunProcess.mockReturnValue(false);
      jest.resetModules();

      const { updatePackages: bunUpdatePackages } =
        await import('../../update/update-packages');
      await bunUpdatePackages(['@appweaver/core'], '1.2.3');

      expect(runProcess).toHaveBeenCalledWith('npm', expect.any(Array), {
        quiet: true
      });
    });
  });
});
