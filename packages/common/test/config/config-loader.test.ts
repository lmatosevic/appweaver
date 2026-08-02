import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Type } from '@sinclair/typebox';
import {
  loadConfigFromEnv,
  loadConfigFromFile,
  loadConfigFromFiles,
  loadPackageJson
} from '../../config/config-loader';
import { CONFIG_NAME } from '../../constants';

const schema = Type.Object({
  APP_NAME: Type.String({ default: 'Appweaver' }),
  APP_ENV: Type.String({ default: 'prod', mapFrom: 'TEST_NODE_ENV' } as any),
  LOG_LEVEL: Type.String({ default: 'info' }),
  LOG_PRETTY: Type.Boolean({ default: false }),
  SERVER_HEADERS: Type.Array(Type.String(), { default: ['default'] }),
  EMPTY_VALUE: Type.String()
});

describe('config-loader', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-config-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadConfigFromEnv', () => {
    test('maps environment variables declared in the schema', () => {
      process.env.APP_NAME = 'From Env';
      process.env.LOG_LEVEL = 'debug';

      const { config } = loadConfigFromEnv(schema);

      expect(config['APP_NAME']).toBe('From Env');
      expect(config['LOG_LEVEL']).toBe('debug');
    });

    test('parses array properties using a comma delimiter', () => {
      process.env.SERVER_HEADERS = 'a,b,c';

      const { config } = loadConfigFromEnv(schema);

      expect(config['SERVER_HEADERS']).toEqual(['a', 'b', 'c']);
    });

    test('parses boolean properties', () => {
      process.env.LOG_PRETTY = 'YES';

      expect(loadConfigFromEnv(schema).config['LOG_PRETTY']).toBe(true);

      process.env.LOG_PRETTY = 'nope';

      expect(loadConfigFromEnv(schema).config['LOG_PRETTY']).toBe(false);
    });

    test('renames a variable declared with mapFrom', () => {
      process.env.TEST_NODE_ENV = 'staging';

      const { config } = loadConfigFromEnv(schema);

      expect(config['APP_ENV']).toBe('staging');
    });

    test('stores unknown variables under the prefixed key', () => {
      process.env.SOME_CUSTOM_VAR = 'custom';

      const { config } = loadConfigFromEnv(schema);

      expect(config[`_${CONFIG_NAME}_SOME_CUSTOM_VAR`]).toBe('custom');
      expect(config['SOME_CUSTOM_VAR']).toBeUndefined();
    });

    test('skips known variables with an empty value', () => {
      process.env.EMPTY_VALUE = '';

      const { config } = loadConfigFromEnv(schema);

      expect('EMPTY_VALUE' in config).toBe(false);
    });

    test('expands references between environment variables', () => {
      process.env.TEST_BASE_DIR = '/data';
      process.env.TEST_FULL_DIR = '${TEST_BASE_DIR}/storage';

      const { config } = loadConfigFromEnv(schema);

      expect(config[`_${CONFIG_NAME}_TEST_FULL_DIR`]).toBe('/data/storage');
      expect(process.env.TEST_FULL_DIR).toBe('/data/storage');
    });

    test('reports no files when no .env file exists', () => {
      expect(loadConfigFromEnv(schema).files).toEqual([]);
    });

    test('falls back to the dev .env file when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      fs.writeFileSync(path.join(tempDir, '.env.dev'), 'DOTENV_DEV=dev\n');

      const { config, files } = loadConfigFromEnv(schema);

      expect(files).toEqual(['.env.dev']);
      expect(config[`_${CONFIG_NAME}_DOTENV_DEV`]).toBe('dev');
    });

    test('loads the default and the environment specific .env files', () => {
      process.env.NODE_ENV = 'test';
      fs.writeFileSync(
        path.join(tempDir, '.env'),
        'DOTENV_ONLY=base\nDOTENV_OVERRIDDEN=base\n'
      );
      fs.writeFileSync(
        path.join(tempDir, '.env.test'),
        'DOTENV_OVERRIDDEN=override\n'
      );

      const { config, files } = loadConfigFromEnv(schema);

      expect(files).toEqual(['.env', '.env.test']);
      expect(config[`_${CONFIG_NAME}_DOTENV_ONLY`]).toBe('base');
      expect(config[`_${CONFIG_NAME}_DOTENV_OVERRIDDEN`]).toBe('override');
    });
  });

  describe('loadConfigFromFile', () => {
    const writeConfig = (name: string, data: Record<string, any>): string => {
      const filePath = path.join(tempDir, name);
      fs.writeFileSync(filePath, JSON.stringify(data));
      return filePath;
    };

    test('returns null when the file does not exist', () => {
      expect(loadConfigFromFile(schema, './missing.json')).toBeNull();
    });

    test('flattens the nested config into upper snake case keys', () => {
      const filePath = writeConfig('appweaver.json', {
        config: { app: { name: 'From File' }, logLevel: 'trace' }
      });

      const config = loadConfigFromFile(schema, filePath);

      expect(config).toMatchObject({
        APP_NAME: 'From File',
        LOG_LEVEL: 'trace'
      });
    });

    test('keeps array values intact', () => {
      const filePath = writeConfig('appweaver.json', {
        config: { server: { headers: ['a', 'b'] } }
      });

      expect(loadConfigFromFile(schema, filePath)?.['SERVER_HEADERS']).toEqual([
        'a',
        'b'
      ]);
    });

    test('keeps boolean and numeric values intact', () => {
      const filePath = writeConfig('appweaver.json', {
        config: { logPretty: true }
      });

      expect(loadConfigFromFile(schema, filePath)?.['LOG_PRETTY']).toBe(true);
    });

    test('stores unknown properties under the prefixed key', () => {
      const filePath = writeConfig('appweaver.json', {
        config: { custom: { deepValue: 'x' } }
      });

      expect(
        loadConfigFromFile(schema, filePath)?.[
          `_${CONFIG_NAME}_CUSTOM_DEEP_VALUE`
        ]
      ).toBe('x');
    });

    test('skips known properties with an empty, null or undefined value', () => {
      const filePath = writeConfig('appweaver.json', {
        config: { emptyValue: '', appName: null }
      });

      const config = loadConfigFromFile(schema, filePath);

      expect('EMPTY_VALUE' in (config ?? {})).toBe(false);
      expect('APP_NAME' in (config ?? {})).toBe(false);
    });

    test('returns an empty object when the file has no config section', () => {
      const filePath = writeConfig('appweaver.json', {});
      expect(loadConfigFromFile(schema, filePath)).toEqual({});
    });

    test('throws for malformed JSON', () => {
      const filePath = path.join(tempDir, 'broken.json');
      fs.writeFileSync(filePath, '{ not json');
      expect(() => loadConfigFromFile(schema, filePath)).toThrow();
    });

    test('resolves a relative file path against the cwd', () => {
      writeConfig('relative.json', { config: { app: { name: 'Relative' } } });
      expect(loadConfigFromFile(schema, './relative.json')?.['APP_NAME']).toBe(
        'Relative'
      );
    });
  });

  describe('loadConfigFromFiles', () => {
    test('returns an empty config when no file exists', () => {
      expect(loadConfigFromFiles(schema)).toEqual({ config: {}, files: [] });
    });

    test('loads only the global config file', () => {
      process.env.NODE_ENV = 'test';
      fs.writeFileSync(
        path.join(tempDir, `${CONFIG_NAME}.json`),
        JSON.stringify({ config: { app: { name: 'Global' } } })
      );

      const { config, files } = loadConfigFromFiles(schema);

      expect(files).toEqual([`./${CONFIG_NAME}.json`]);
      expect(config['APP_NAME']).toBe('Global');
    });

    test('merges the environment specific file over the global one', () => {
      process.env.NODE_ENV = 'test';
      fs.writeFileSync(
        path.join(tempDir, `${CONFIG_NAME}.json`),
        JSON.stringify({
          config: { app: { name: 'Global' }, logLevel: 'info' }
        })
      );
      fs.writeFileSync(
        path.join(tempDir, `${CONFIG_NAME}.test.json`),
        JSON.stringify({ config: { logLevel: 'debug' } })
      );

      const { config, files } = loadConfigFromFiles(schema);

      expect(files).toEqual([
        `./${CONFIG_NAME}.json`,
        `./${CONFIG_NAME}.test.json`
      ]);
      expect(config['APP_NAME']).toBe('Global');
      expect(config['LOG_LEVEL']).toBe('debug');
    });
  });

  describe('loadPackageJson', () => {
    test('reads and parses the package.json from the cwd', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'temp-app', version: '1.2.3' })
      );

      expect(loadPackageJson()).toEqual({
        name: 'temp-app',
        version: '1.2.3'
      });
    });

    test('reads a package.json from a custom relative path', () => {
      fs.mkdirSync(path.join(tempDir, 'nested'));
      fs.writeFileSync(
        path.join(tempDir, 'nested', 'package.json'),
        JSON.stringify({ name: 'nested-app' })
      );

      expect(loadPackageJson('./nested/package.json').name).toBe('nested-app');
    });

    test('throws when the file does not exist', () => {
      expect(() => loadPackageJson()).toThrow();
    });
  });
});
