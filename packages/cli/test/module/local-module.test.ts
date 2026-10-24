import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { localModuleFiles, writeModuleFiles } from '../../module/local-module';

describe('local-module', () => {
  describe('localModuleFiles', () => {
    test('creates the manifest, the config and the startup code', () => {
      const files = localModuleFiles('audit-log');

      expect(Object.keys(files)).toEqual([
        path.join('src/modules/audit-log/module.ts'),
        path.join('src/modules/audit-log/config.ts'),
        path.join('src/modules/audit-log/main.ts')
      ]);
      expect(files[path.join('src/modules/audit-log/module.ts')]).toContain(
        "name: 'audit-log'"
      );
      expect(files[path.join('src/modules/audit-log/config.ts')]).toContain(
        "defineConfig('auditLog'"
      );
    });

    test('rejects a name that is not kebab-case', () => {
      expect(() => localModuleFiles('AuditLog')).toThrow('kebab-case');
    });
  });

  describe('writeModuleFiles', () => {
    test('writes the files and refuses to overwrite them', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-local-'));
      const files = localModuleFiles('billing');

      writeModuleFiles(dir, files);

      expect(
        fs.existsSync(path.join(dir, 'src/modules/billing/module.ts'))
      ).toBe(true);
      expect(() => writeModuleFiles(dir, files)).toThrow('exist already');
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});
