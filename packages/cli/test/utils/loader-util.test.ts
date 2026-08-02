import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadCliPackageJson,
  loadLocalPackageJson
} from '../../utils/loader-util';

describe('loader-util', () => {
  describe('loadCliPackageJson', () => {
    test('loads the package.json of the CLI package', () => {
      const pkg = loadCliPackageJson();

      expect(pkg.name).toBe('@appweaver/cli');
      expect(typeof pkg.version).toBe('string');
    });

    test('exposes the weaver binary', () => {
      expect(loadCliPackageJson().bin).toHaveProperty('weaver');
    });
  });

  describe('loadLocalPackageJson', () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-cli-pkg-'));
      process.chdir(tempDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('loads the package.json from the working directory', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'my-app',
          dependencies: { '@appweaver/core': '1.0.0' }
        }),
        'utf8'
      );

      const pkg = await loadLocalPackageJson();

      expect(pkg.name).toBe('my-app');
      expect(pkg.dependencies).toEqual({ '@appweaver/core': '1.0.0' });
    });

    test('rejects when the working directory has no package.json', async () => {
      await expect(loadLocalPackageJson()).rejects.toThrow();
    });

    test('rejects when the package.json is not valid JSON', async () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{ invalid', 'utf8');

      await expect(loadLocalPackageJson()).rejects.toThrow(SyntaxError);
    });
  });
});
