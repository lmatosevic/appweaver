import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineModule } from '@appweaver/common';
import {
  isModulePackage,
  loadCliPackageJson,
  loadLocalPackageJson,
  shipsResourceRegistry
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

  describe('isModulePackage', () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-cli-mod-'));
      process.chdir(tempDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('tells a module package by its appweaver.module field', async () => {
      fs.writeFileSync(
        'package.json',
        JSON.stringify({ appweaver: { module: './dist/module.js' } })
      );

      await expect(isModulePackage()).resolves.toBe(true);
    });

    test('tells an application, or a directory without a package', async () => {
      await expect(isModulePackage()).resolves.toBe(false);

      fs.writeFileSync('package.json', JSON.stringify({ name: 'my-app' }));

      await expect(isModulePackage()).resolves.toBe(false);
    });
  });

  describe('shipsResourceRegistry', () => {
    let packageDir: string;

    const enabled = (source: 'package' | 'local' = 'package') => ({
      module: defineModule({ name: 'acme-billing' }),
      source,
      path: path.join(packageDir, 'dist', 'module.js')
    });

    beforeEach(() => {
      packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-cli-reg-'));
      fs.mkdirSync(path.join(packageDir, 'dist', 'types'), { recursive: true });
      fs.mkdirSync(path.join(packageDir, 'node_modules', 'dep'), {
        recursive: true
      });
      fs.writeFileSync(path.join(packageDir, 'package.json'), '{}');
    });

    afterEach(() => {
      fs.rmSync(packageDir, { recursive: true, force: true });
    });

    const registry =
      "declare module '@appweaver/common' { interface ResourceRegistry { Invoice: {} } }";

    test('finds a registry declaration of the package', () => {
      fs.writeFileSync(
        path.join(packageDir, 'dist', 'types', 'generated.d.ts'),
        registry
      );

      expect(shipsResourceRegistry(enabled())).toBe(true);
    });

    test('ignores the declarations of its dependencies and other files', () => {
      fs.writeFileSync(
        path.join(packageDir, 'node_modules', 'dep', 'index.d.ts'),
        registry
      );
      fs.writeFileSync(path.join(packageDir, 'dist', 'module.js'), registry);

      expect(shipsResourceRegistry(enabled())).toBe(false);
    });

    test('checks only the package modules', () => {
      fs.writeFileSync(path.join(packageDir, 'dist', 'index.d.ts'), registry);

      expect(shipsResourceRegistry(enabled('local'))).toBe(false);
    });
  });
});
