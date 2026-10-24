import { Type } from '@sinclair/typebox';
import { CONFIG_NAME } from '../../constants';
import { ConfigurationError } from '../../errors';
import {
  configOverrides,
  configSections,
  configSource,
  defineConfig,
  readConfig,
  readRawConfig,
  sectionPrefix,
  setRawConfig
} from '../../config/define-config';

/** Prefixes the flattened keys the way the loader stores them. */
const raw = (values: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      `_${CONFIG_NAME}_${key}`,
      value
    ])
  ) as Record<string, any>;

let sectionId = 0;

/** A section path no other case defines, since a key belongs to one section only. */
const uniqueSection = (name: string) => `${name}${++sectionId}`;

describe('define-config', () => {
  afterEach(() => {
    setRawConfig({}, {});
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('sectionPrefix', () => {
    test('flattens a dotted path into an upper snake case prefix', () => {
      expect(sectionPrefix('server')).toBe('SERVER_');
      expect(sectionPrefix('storage.gcs')).toBe('STORAGE_GCS_');
      expect(sectionPrefix('security.apiKey')).toBe('SECURITY_API_KEY_');
      expect(sectionPrefix('security.account.2fa')).toBe(
        'SECURITY_ACCOUNT_2FA_'
      );
    });
  });

  describe('defineConfig', () => {
    test('reads the values of the JSON files under the section prefix', () => {
      const section = uniqueSection('json');
      const prefix = sectionPrefix(section);
      setRawConfig(raw({ [`${prefix}NAME`]: 'From JSON' }), {});

      const values = defineConfig(section, { NAME: Type.String() });

      expect(values.NAME).toBe('From JSON');
    });

    test('prefers the environment over the JSON files', () => {
      const section = uniqueSection('env');
      const prefix = sectionPrefix(section);
      setRawConfig(
        raw({ [`${prefix}NAME`]: 'From JSON' }),
        raw({ [`${prefix}NAME`]: 'From Env' })
      );

      const values = defineConfig(section, { NAME: Type.String() });

      expect(values.NAME).toBe('From Env');
    });

    test('converts the environment strings by the schema of the key', () => {
      const section = uniqueSection('convert');
      const prefix = sectionPrefix(section);
      setRawConfig(
        {},
        raw({
          [`${prefix}PORT`]: '8080',
          [`${prefix}ENABLED`]: 'yes',
          [`${prefix}HOSTS`]: 'a,b,c'
        })
      );

      const values = defineConfig(section, {
        PORT: Type.Integer(),
        ENABLED: Type.Boolean(),
        HOSTS: Type.Array(Type.String())
      });

      expect(values).toEqual({
        PORT: 8080,
        ENABLED: true,
        HOSTS: ['a', 'b', 'c']
      });
    });

    test('applies the defaults of the schema to the missing and empty values', () => {
      const section = uniqueSection('defaults');
      const prefix = sectionPrefix(section);
      setRawConfig(raw({ [`${prefix}PATH`]: '' }), {});

      const values = defineConfig(section, {
        PATH: Type.String({ default: './storage' }),
        LIMIT: Type.Integer({ default: 10 }),
        NOTE: Type.Optional(Type.String())
      });

      expect(values).toEqual({ PATH: './storage', LIMIT: 10 });
    });

    test('reads a key from the environment variable it is mapped from', () => {
      const section = uniqueSection('mapped');
      setRawConfig({}, raw({ MAPPED_SOURCE: 'staging' }));

      const values = defineConfig(section, {
        ENV: Type.String({ default: 'prod', mapFrom: 'MAPPED_SOURCE' })
      });

      expect(values.ENV).toBe('staging');
    });

    test('derives values with the transform of the section', () => {
      const section = uniqueSection('transform');

      const values = defineConfig(
        section,
        { PATTERN: Type.String({ default: '<srcPath>/*.ts' }) },
        {
          transform: (parsed) => ({
            PATTERN: parsed.PATTERN.replace('<srcPath>', './src')
          })
        }
      );

      expect(values.PATTERN).toBe('./src/*.ts');
    });

    test('parses the section once, on the first access', () => {
      const section = uniqueSection('lazy');
      const prefix = sectionPrefix(section);
      const transform = jest.fn((parsed) => parsed);

      const values = defineConfig(
        section,
        { NAME: Type.String({ default: 'first' }) },
        { transform }
      );
      expect(transform).not.toHaveBeenCalled();

      expect(values.NAME).toBe('first');
      setRawConfig({}, raw({ [`${prefix}NAME`]: 'second' }));
      expect(values.NAME).toBe('first');
      expect(transform).toHaveBeenCalledTimes(1);
    });

    test('returns the overrides of the flattened keys over the parsed values', () => {
      const section = uniqueSection('override');
      const prefix = sectionPrefix(section);
      const values = defineConfig(section, {
        NAME: Type.String({ default: 'parsed' })
      });

      configOverrides[`${prefix}NAME`] = 'overridden';
      expect(values.NAME).toBe('overridden');

      delete configOverrides[`${prefix}NAME`];
      expect(values.NAME).toBe('parsed');
    });

    test('returns a frozen object with enumerable keys', () => {
      const values = defineConfig(uniqueSection('frozen'), {
        NAME: Type.String({ default: 'value' })
      });

      expect(Object.isFrozen(values)).toBe(true);
      expect({ ...values }).toEqual({ NAME: 'value' });
    });

    test('registers the section', () => {
      const section = uniqueSection('registered');

      defineConfig(section, { NAME: Type.String({ default: 'value' }) });

      expect(configSections.get(`${section}:NAME`)).toMatchObject({
        section,
        prefix: sectionPrefix(section)
      });
    });

    test('registers both definitions of a path with their own keys', () => {
      const section = uniqueSection('shared');

      defineConfig(section, { FIRST: Type.String({ default: 'a' }) });
      defineConfig(section, { SECOND: Type.String({ default: 'b' }) });

      const definitions = [...configSections.values()].filter(
        (definition) => definition.section === section
      );
      expect(definitions).toHaveLength(2);
    });

    test('lets a section be defined again, i.e. by a reloaded module', () => {
      const section = uniqueSection('reloaded');
      defineConfig(section, { NAME: Type.String({ default: 'a' }) });

      expect(
        defineConfig(section, { NAME: Type.String({ default: 'b' }) }).NAME
      ).toBe('b');
    });

    test('rejects a key that another section already declares', () => {
      const section = uniqueSection('owner');
      defineConfig(`${section}.child`, { NAME: Type.String({ default: 'a' }) });

      expect(() =>
        defineConfig(section, { CHILD_NAME: Type.String({ default: 'b' }) })
      ).toThrow(ConfigurationError);
    });

    test('names the environment variable and the JSON path of an invalid value', () => {
      const section = uniqueSection('invalid');
      const prefix = sectionPrefix(section);
      setRawConfig({}, raw({ [`${prefix}MAX_SIZE`]: 'many' }));

      const values = defineConfig(section, { MAX_SIZE: Type.Integer() });

      expect(() => values.MAX_SIZE).toThrow(ConfigurationError);
      expect(() => values.MAX_SIZE).toThrow(
        `${prefix}MAX_SIZE (config.${section}.maxSize)`
      );
    });

    test('names only the invalid values, not the keys with a default', () => {
      const section = uniqueSection('defaulted');
      const prefix = sectionPrefix(section);
      setRawConfig({}, raw({ [`${prefix}PORT`]: 'abc' }));

      const values = defineConfig(section, {
        PORT: Type.Integer(),
        HOST: Type.String({ default: 'localhost' })
      });

      expect(() => values.PORT).toThrow(
        `Invalid config of section "${section}": ${prefix}PORT (config.${section}.port): Expected integer`
      );
    });
  });

  describe('configSource', () => {
    test('tells the source of a value', () => {
      setRawConfig(
        raw({ SRC_JSON: 'a', SRC_BOTH: 'b' }),
        raw({ SRC_BOTH: 'c' })
      );
      configOverrides.SRC_OVERRIDE = 1;

      expect(configSource('SRC_JSON')).toBe('json');
      expect(configSource('SRC_BOTH')).toBe('env');
      expect(configSource('SRC_OVERRIDE')).toBe('override');
      expect(configSource('SRC_MISSING')).toBe('default');
    });
  });

  describe('readConfig', () => {
    test('reads the parsed value of a declared key', () => {
      const section = uniqueSection('read');
      const prefix = sectionPrefix(section);
      defineConfig(section, { LIMIT: Type.Integer({ default: 5 }) });

      expect(readConfig(`${prefix}LIMIT`)).toBe(5);
    });

    test('reads the keys of a section path defined by two packages', () => {
      const section = uniqueSection('shared');
      const prefix = sectionPrefix(section);
      defineConfig(section, { FIRST: Type.Integer({ default: 1 }) });
      defineConfig(section, { SECOND: Type.Integer({ default: 2 }) });

      expect(readConfig(`${prefix}FIRST`)).toBe(1);
      expect(readConfig(`${prefix}SECOND`)).toBe(2);
    });

    test('reads the raw value of a key no section declares', () => {
      setRawConfig(raw({ CUSTOM_KEY: 'json' }), raw({ CUSTOM_KEY: 'env' }));

      expect(readConfig('CUSTOM_KEY')).toBe('env');
    });
  });

  describe('readRawConfig', () => {
    test('reads the environment over the JSON files', () => {
      setRawConfig(
        raw({ RAW_KEY: 'json', ONLY_JSON: 1 }),
        raw({ RAW_KEY: 'env' })
      );

      expect(readRawConfig('RAW_KEY')).toBe('env');
      expect(readRawConfig('ONLY_JSON')).toBe(1);
    });

    test('skips the empty values and returns the overrides first', () => {
      setRawConfig(raw({ RAW_EMPTY: 'json' }), raw({ RAW_EMPTY: '' }));
      expect(readRawConfig('RAW_EMPTY')).toBe('json');

      configOverrides.RAW_EMPTY = 'override';
      expect(readRawConfig('RAW_EMPTY')).toBe('override');
      expect(readRawConfig('RAW_MISSING')).toBeUndefined();
    });
  });
});
