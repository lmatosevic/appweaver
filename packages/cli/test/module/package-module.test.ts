import path from 'node:path';
import {
  describePackageModule,
  isPackageName
} from '../../module/package-module';

const rootPath = path.join(__dirname, 'fixtures/project');

describe('package-module', () => {
  describe('isPackageName', () => {
    const scaffoldModules = ['redis', 'audit-log'];

    test('tells a package name apart from an optional module', () => {
      expect(isPackageName('@acme/appweaver-gcs', scaffoldModules)).toBe(true);
      expect(isPackageName('appweaver-brevo', scaffoldModules)).toBe(true);
      expect(isPackageName('redis', scaffoldModules)).toBe(false);
    });

    test('keeps a scaffold module with a dash, and a mistyped name, a module', () => {
      expect(isPackageName('audit-log', scaffoldModules)).toBe(false);
      expect(isPackageName('redsi', scaffoldModules)).toBe(false);
    });
  });

  describe('describePackageModule', () => {
    test('describes the providers and the requirements of a module', () => {
      expect(describePackageModule(rootPath, 'acme-storage')).toEqual([
        'Module acme-storage is enabled.',
        '  provides Storage "acme", select it in the provider key of the contract',
        '  requires acme-base'
      ]);
    });

    test('tells a package that is not a module', () => {
      expect(describePackageModule(rootPath, 'plain-lib')).toEqual([
        'Package plain-lib is not an Appweaver module, its package.json has no appweaver.module field.'
      ]);
    });

    test('tells a package that is not installed', () => {
      expect(describePackageModule(rootPath, 'missing-lib')).toEqual([
        'Package missing-lib is not installed.'
      ]);
    });
  });
});
