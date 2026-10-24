import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Type } from '@sinclair/typebox';
import {
  configOverrides,
  defineConfig,
  defineModule,
  ErrorCode,
  logger,
  Memory
} from '@appweaver/common';
import {
  checkModuleConfig,
  discoverModules,
  moduleDirectories
} from '../../app/discover-modules';
import { context } from '../../context/context';

const rootPath = path.join(__dirname, '../fixtures/modules/project');
const scanPath = path.join(rootPath, 'src');

/** Discovers the modules of the fixture project, returning their names. */
async function discoverNames(): Promise<string[]> {
  const modules = await discoverModules({ scanPath, rootPath });
  return modules.map(({ module }) => module.name);
}

describe('discover-modules', () => {
  beforeEach(() => {
    configOverrides.APP_MODULES_PATTERN = './src/modules/*/module.ts';
  });

  afterEach(() => {
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('discoverModules', () => {
    test('finds the first-party, package, local and explicit modules', async () => {
      configOverrides.APP_MODULES = ['shared/module.js'];

      expect(await discoverNames()).toEqual([
        '@appweaver/core',
        'acme-base',
        'acme-gcs',
        'billing',
        'shared'
      ]);
    });

    test('tells where every module was found', async () => {
      configOverrides.APP_MODULES = ['shared/module.js'];

      const modules = await discoverModules({ scanPath, rootPath });

      expect(
        Object.fromEntries(
          modules.map(({ module, source }) => [module.name, source])
        )
      ).toMatchObject({
        '@appweaver/core': 'core',
        'acme-gcs': 'package',
        billing: 'local',
        shared: 'explicit'
      });
    });

    test('finds no local modules with an empty pattern', async () => {
      configOverrides.APP_MODULES_PATTERN = '';

      expect(await discoverNames()).not.toContain('billing');
    });

    test('leaves out the disabled modules', async () => {
      configOverrides.APP_MODULES_DISABLED = ['billing', '@appweaver/web'];

      const names = await discoverNames();

      expect(names).not.toContain('billing');
      expect(names).not.toContain('@appweaver/web');
      expect(names).toContain('acme-gcs');
    });

    test('fails when a required module is disabled', async () => {
      configOverrides.APP_MODULES_DISABLED = ['acme-base'];

      await expect(discoverNames()).rejects.toMatchObject({
        code: ErrorCode.ModuleMissing,
        details: { name: 'acme-base', requiredBy: 'acme-gcs' }
      });
    });

    test('fails for two modules with the same name', async () => {
      configOverrides.APP_MODULES = ['src/modules/billing/module.js'];

      await expect(discoverNames()).rejects.toMatchObject({
        code: ErrorCode.ModuleDuplicate,
        details: { name: 'billing' }
      });
    });

    test('fails for a file without a manifest', async () => {
      configOverrides.APP_MODULES = ['invalid/module.js'];

      await expect(discoverNames()).rejects.toMatchObject({
        code: ErrorCode.ModuleInvalid
      });
    });

    test('requires the TypeScript manifests of the sources as they are', async () => {
      const sourcesRoot = path.join(__dirname, '../fixtures/modules/sources');

      const modules = await discoverModules({
        scanPath: path.join(sourcesRoot, 'src'),
        rootPath: sourcesRoot,
        sources: true
      });

      expect(modules.map(({ module }) => module.name)).toEqual([
        '@appweaver/core',
        'billing-sources'
      ]);
    });

    test('warns about a module package loading its own copy of common', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-copy-'));
      const write = (file: string, content: string) => {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), content);
      };
      write('package.json', JSON.stringify({ dependencies: { linked: '1' } }));
      write('node_modules/@appweaver/common/package.json', '{}');
      write(
        'node_modules/linked/package.json',
        JSON.stringify({ appweaver: { module: './module.js' } })
      );
      write(
        'node_modules/linked/module.js',
        "module.exports = require('@appweaver/common').defineModule({ name: 'linked' });"
      );
      write(
        'node_modules/linked/node_modules/@appweaver/common/package.json',
        '{}'
      );
      const warn = jest.spyOn(logger, 'warn').mockImplementation();
      configOverrides.APP_MODULES_PATTERN = '';

      const modules = await discoverModules({ scanPath: root, rootPath: root });

      expect(modules.map(({ module }) => module.name)).toContain('linked');
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'linked' }),
        expect.stringContaining('loads its own copy of @appweaver/common')
      );
      warn.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    });

    test('warns without a package.json in the working directory', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-nopkg-'));
      const warn = jest.spyOn(logger, 'warn').mockImplementation();
      configOverrides.APP_MODULES_PATTERN = '';

      await discoverModules({ scanPath: root, rootPath: root });

      expect(warn).toHaveBeenCalledWith(
        { rootPath: root },
        expect.stringContaining('No package.json')
      );
      warn.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    });

    test('fails for a module supporting another framework version', async () => {
      configOverrides.APP_MODULES = ['future/module.js'];

      await expect(discoverNames()).rejects.toMatchObject({
        code: ErrorCode.ModuleIncompatible,
        details: { name: 'future', framework: '>=99.0.0' }
      });
    });
  });

  describe('moduleDirectories', () => {
    afterEach(() => {
      context.modules.enabled.length = 0;
    });

    test('returns the directories of the modules declaring the part', () => {
      context.modules.enabled.push(
        defineModule({ name: 'a', locales: '/a/locales' }),
        defineModule({ name: 'b' }),
        defineModule({
          name: 'c',
          locales: '/c/locales',
          seeders: '/c/seeders'
        })
      );

      expect(moduleDirectories('locales')).toEqual([
        '/a/locales',
        '/c/locales'
      ]);
      expect(moduleDirectories('templates')).toEqual([]);
    });
  });

  describe('checkModuleConfig', () => {
    // A required key without a value fails to parse
    const invalidConfig = defineConfig('discoverModulesTest', {
      KEY: Type.String()
    });
    const load = () => ({});

    afterEach(() => {
      context.modules.enabled.length = 0;
      context.modules.providers.clear();
    });

    test('fails for an invalid config section of a module', () => {
      context.modules.enabled.push(
        defineModule({ name: 'feature', config: [invalidConfig] })
      );

      expect(() => checkModuleConfig()).toThrow('DISCOVER_MODULES_TEST_KEY');
    });

    test('checks the config of a driver module only when it is selected', () => {
      context.modules.enabled.push(
        defineModule({
          name: 'valkey',
          config: [invalidConfig],
          providers: [{ contract: Memory, name: 'valkey', load }]
        })
      );

      expect(() => checkModuleConfig()).not.toThrow();

      context.modules.providers.set('Memory', 'valkey');

      expect(() => checkModuleConfig()).toThrow('DISCOVER_MODULES_TEST_KEY');
    });
  });
});
