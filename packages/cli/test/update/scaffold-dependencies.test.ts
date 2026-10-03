import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const runProcessOutput = jest.fn<
  Promise<{ code: number; stdout: string }>,
  any[]
>();
const isBunRuntime = jest.fn<boolean, []>();

jest.mock('../../utils', () => ({
  runProcessOutput: (...args: any[]) => runProcessOutput(...args)
}));

jest.mock('../../update/update-packages', () => ({
  isBunRuntime: () => isBunRuntime()
}));

import {
  fetchScaffoldDependencies,
  loadInstalledVersion,
  resolveScaffoldUpdates,
  ScaffoldDependencies
} from '../../update/scaffold-dependencies';

const scaffold: ScaffoldDependencies = {
  companion: { prisma: '7.9.1', bullmq: '5.79.1', ioredis: '5.11.1' },
  tooling: { eslint: '9.39.2', jest: '30.5.2' }
};

describe('scaffold-dependencies', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    runProcessOutput.mockReset();
    isBunRuntime.mockReset();
    isBunRuntime.mockReturnValue(false);
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-scaffold-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const installModule = (name: string, version: string) => {
    const dir = path.join(tempDir, 'node_modules', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name, version }),
      'utf8'
    );
  };

  describe('fetchScaffoldDependencies', () => {
    test('reads the field of the release with npm view', async () => {
      runProcessOutput.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify([scaffold])
      });

      await expect(fetchScaffoldDependencies('1.7.0')).resolves.toEqual(
        scaffold
      );
      expect(runProcessOutput).toHaveBeenCalledWith('npm', [
        'view',
        '@appweaver/cli@1.7.0',
        'scaffoldDependencies',
        '--json'
      ]);
    });

    test('reads the field with bun info in the Bun runtime', async () => {
      isBunRuntime.mockReturnValue(true);
      runProcessOutput.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify(scaffold)
      });

      await expect(fetchScaffoldDependencies('latest')).resolves.toEqual(
        scaffold
      );
      expect(runProcessOutput).toHaveBeenCalledWith('bun', [
        'info',
        '@appweaver/cli@latest',
        'scaffoldDependencies',
        '--json'
      ]);
    });

    test('returns null for a release without the field', async () => {
      runProcessOutput.mockResolvedValue({ code: 0, stdout: '' });

      await expect(fetchScaffoldDependencies('1.6.2')).resolves.toBeNull();
    });

    test('returns null when the registry lookup fails', async () => {
      runProcessOutput.mockResolvedValue({
        code: 1,
        stdout: '{ "error": { "code": "E404" } }'
      });

      await expect(fetchScaffoldDependencies('99.0.0')).resolves.toBeNull();
    });

    test('returns null for an unexpected output', async () => {
      runProcessOutput.mockResolvedValue({ code: 0, stdout: '{"a": 1}' });

      await expect(fetchScaffoldDependencies('1.7.0')).resolves.toBeNull();
    });
  });

  describe('resolveScaffoldUpdates', () => {
    test('updates only the installed packages with a lower version', async () => {
      const updates = await resolveScaffoldUpdates(
        scaffold,
        { prisma: '7.8.0', bullmq: '5.79.1', eslint: '9.0.0' },
        { companion: true, tooling: false }
      );

      expect(updates).toEqual([{ name: 'prisma', from: '7.8.0', to: '7.9.1' }]);
    });

    test('includes the tooling packages when requested', async () => {
      const updates = await resolveScaffoldUpdates(
        scaffold,
        { prisma: '7.8.0', eslint: '^9.0.0' },
        { companion: false, tooling: true }
      );

      expect(updates).toEqual([
        { name: 'eslint', from: '9.0.0', to: '9.39.2' }
      ]);
    });

    test('compares with the version installed in node_modules', async () => {
      installModule('ioredis', '5.12.0');
      installModule('prisma', '7.9.0');

      const updates = await resolveScaffoldUpdates(
        scaffold,
        { ioredis: '^5.0.0', prisma: '^7.0.0' },
        { companion: true, tooling: false }
      );

      expect(updates).toEqual([{ name: 'prisma', from: '7.9.0', to: '7.9.1' }]);
    });

    test('never downgrades a package', async () => {
      const updates = await resolveScaffoldUpdates(
        scaffold,
        { prisma: '8.0.0' },
        { companion: true, tooling: true }
      );

      expect(updates).toEqual([]);
    });

    test('leaves the packages not installed from the registry', async () => {
      const updates = await resolveScaffoldUpdates(
        scaffold,
        { prisma: 'file:../prisma', bullmq: 'latest' },
        { companion: true, tooling: false }
      );

      expect(updates).toEqual([]);
    });
  });

  describe('loadInstalledVersion', () => {
    test('reads the version without the prerelease suffix', async () => {
      installModule('@prisma/client', '7.10.0-dev.3');

      await expect(loadInstalledVersion('@prisma/client')).resolves.toBe(
        '7.10.0'
      );
    });

    test('returns undefined for a missing package', async () => {
      await expect(loadInstalledVersion('bullmq')).resolves.toBeUndefined();
    });
  });
});
