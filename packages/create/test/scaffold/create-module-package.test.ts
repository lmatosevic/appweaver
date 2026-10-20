import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createModulePackage,
  moduleShortName
} from '../../scaffold/create-module-package';

describe('create-module-package', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-module-package-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const read = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8');

  describe('moduleShortName', () => {
    test('strips the scope and the appweaver prefix', () => {
      expect(moduleShortName('@acme/appweaver-gcs')).toBe('gcs');
      expect(moduleShortName('appweaver-audit-log')).toBe('audit-log');
      expect(moduleShortName('payments')).toBe('payments');
    });
  });

  describe('createModulePackage', () => {
    test('creates a storage driver tested by the contract suite', async () => {
      const files = await createModulePackage({
        dir,
        packageName: '@acme/appweaver-gcs',
        description: 'GCS driver',
        contract: 'storage'
      });

      expect(files).toEqual(
        expect.arrayContaining([
          '.gitignore',
          'package.json',
          'src/module.ts',
          'src/storage.ts',
          'test/storage.test.ts'
        ])
      );
      expect(JSON.parse(read('package.json'))).toMatchObject({
        name: '@acme/appweaver-gcs',
        appweaver: { module: './dist/module.js' }
      });
      expect(read('src/module.ts')).toContain("name: 'gcs'");
      expect(read('src/config.ts')).toContain(
        "export const gcsConfig = defineConfig('storage.gcs'"
      );
      expect(read('src/storage.ts')).toContain(
        'export class GcsStorage extends Storage'
      );
      expect(read('test/storage.test.ts')).toContain(
        "testStorageContract('GcsStorage'"
      );
    });

    test('creates a feature module with its own config section', async () => {
      await createModulePackage({
        dir,
        packageName: 'appweaver-audit-log',
        description: 'Audit log',
        contract: 'none'
      });

      expect(read('src/config.ts')).toContain("defineConfig('auditLog'");
      expect(read('src/module.ts')).toContain("main: () => import('./main')");
      expect(read('README.md')).toContain('AUDIT_LOG_*');
    });

    test('rejects an invalid package name', async () => {
      await expect(
        createModulePackage({
          dir,
          packageName: 'Not A Name',
          description: '',
          contract: 'none'
        })
      ).rejects.toThrow('Invalid package name');
    });
  });
});
