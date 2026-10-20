import { Static, TObject, TProperties, TSchema, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { CONFIG_NAME } from '../constants';
import { ConfigurationError, ErrorCode } from '../errors';
import { camelToSnakeCase, parseArray, snakeToCamelCase } from '../utils';
import { ConfigEntry } from './config-loader';

/** The values of a config section, typed by its properties. */
export type ConfigValues<P extends TProperties> = Static<TObject<P>>;

export type DefineConfigOptions<V> = {
  /** Derives values after the section is parsed, i.e. a default depending on another value. */
  transform?: (values: V) => V;
};

/** A section registered with `defineConfig`. */
export type ConfigSectionDefinition = {
  /** The dotted section path, i.e. `storage.gcs`. */
  section: string;
  /** The prefix of the flattened keys, i.e. `STORAGE_GCS_`. */
  prefix: string;
  /** The schema of the section, keyed by the short names of its keys. */
  schema: TObject;
  /** The values of the section. */
  values: Readonly<Record<string, unknown>>;
};

/** The raw values of the JSON files and the environment, read once when the config module is loaded. */
type RawConfig = { json: ConfigEntry['config']; env: ConfigEntry['config'] };

const rawConfig: RawConfig = { json: {}, env: {} };

/** The registered sections, keyed by their path. */
export const configSections = new Map<string, ConfigSectionDefinition>();

/** The section owning each flattened key. A section path may be defined by several packages, each with its own keys. */
const keyOwners = new Map<string, ConfigSectionDefinition>();

/**
 * Values replacing the config of any section, keyed by the flattened name (`SERVER_PORT`). Meant for tests, which set
 * and delete keys between their cases.
 */
export const configOverrides: Record<string, unknown> = {};

/**
 * Sets the raw values the sections are parsed from, flattened and prefixed with `_appweaver_` by the config loader.
 *
 * @internal
 */
export function setRawConfig(json: RawConfig['json'], env: RawConfig['env']) {
  rawConfig.json = json;
  rawConfig.env = env;
}

/**
 * Reads the raw value of a flattened key, from the environment over the JSON files, without parsing it. Returns
 * `undefined` for a missing or empty value.
 *
 * @param {string} key - The flattened key, i.e. `SERVER_PORT`.
 * @return {unknown} The raw value: a string from the environment, or the value of a JSON file.
 */
export function readRawConfig(key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(configOverrides, key)) {
    return configOverrides[key];
  }
  const rawKey = `_${CONFIG_NAME}_${key}`;
  for (const value of [rawConfig.env[rawKey], rawConfig.json[rawKey]]) {
    if (!isEmpty(value)) {
      return value;
    }
  }
  return undefined;
}

/** Where the value of a config key comes from. */
export type ConfigSource = 'override' | 'env' | 'json' | 'default';

/**
 * Tells where the value of a flattened key comes from: a test override, the environment, the JSON files, or the
 * default of its schema.
 *
 * @param {string} key - The flattened key, i.e. `SERVER_PORT`.
 * @return {ConfigSource} The source of the value.
 */
export function configSource(key: string): ConfigSource {
  if (Object.prototype.hasOwnProperty.call(configOverrides, key)) {
    return 'override';
  }
  const rawKey = `_${CONFIG_NAME}_${key}`;
  if (!isEmpty(rawConfig.env[rawKey])) {
    return 'env';
  }
  if (!isEmpty(rawConfig.json[rawKey])) {
    return 'json';
  }
  return 'default';
}

/**
 * Defines a section of the application config, read from the `appweaver.json` files and the environment variables
 * with the same sources, precedence and flattening as the rest of the config. The section `storage.gcs` with the key
 * `BUCKET` reads `config.storage.gcs.bucket` of the JSON files and the `STORAGE_GCS_BUCKET` environment variable.
 *
 * The section is parsed on the first access of a value, with the defaults of its schema, then kept. A missing or
 * invalid value throws a `ConfigurationError` naming its environment variable and its JSON path.
 *
 * @example
 * export const gcsConfig = defineConfig('storage.gcs', {
 *   BUCKET: Type.String(),
 *   SIGNED_URL_TTL: Type.Integer({ default: 900_000 })
 * });
 *
 * gcsConfig.BUCKET; // string
 *
 * @param {string} section - The dotted path of the section, i.e. `server` or `storage.gcs`.
 * @param {TProperties} properties - The TypeBox schemas of its keys, named in upper snake case without the prefix.
 * @param {DefineConfigOptions} [options={}] - The options of the section.
 * @return {Object} The values of the section, read-only.
 * @throws {ConfigurationError} If a key of the section belongs to another section.
 */
export function defineConfig<P extends TProperties>(
  section: string,
  properties: P,
  options: DefineConfigOptions<ConfigValues<P>> = {}
): Readonly<ConfigValues<P>> {
  const prefix = sectionPrefix(section);
  const schema: TObject = Type.Object(properties) as TObject;

  for (const key of Object.keys(properties)) {
    const owner = keyOwners.get(prefix + key)?.section;
    if (owner !== undefined && owner !== section) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `Config key ${prefix + key} of section "${section}" is already defined by section "${owner}"`
      );
    }
  }

  let values: ConfigValues<P> | undefined;
  const parsed = () => {
    values ??= parseSection(section, prefix, schema, options.transform);
    return values;
  };

  const result = {} as ConfigValues<P>;
  for (const key of Object.keys(properties)) {
    Object.defineProperty(result, key, {
      enumerable: true,
      get: () =>
        Object.prototype.hasOwnProperty.call(configOverrides, prefix + key)
          ? configOverrides[prefix + key]
          : parsed()[key]
    });
  }

  Object.freeze(result);
  const definition = { section, prefix, schema, values: result };
  configSections.set(section, definition);
  for (const key of Object.keys(properties)) {
    keyOwners.set(prefix + key, definition);
  }

  return result;
}

/**
 * Reads the value of a flattened key: the parsed value of the section declaring it, otherwise its raw value.
 *
 * @param {string} key - The flattened key, i.e. `SERVER_PORT`.
 * @return {unknown} The value of the key, or `undefined` when it is not set.
 */
export function readConfig(key: string): unknown {
  const definition = keyOwners.get(key);
  if (definition) {
    return definition.values[key.slice(definition.prefix.length)];
  }
  return readRawConfig(key);
}

/**
 * Returns the prefix of the flattened keys of a section path, i.e. `STORAGE_GCS_` for `storage.gcs`.
 *
 * @param {string} section - The dotted section path.
 * @return {string} The prefix, in upper snake case with a trailing underscore.
 */
export function sectionPrefix(section: string): string {
  return (
    section
      .split('.')
      .map((part) => camelToSnakeCase(part).toUpperCase())
      .join('_') + '_'
  );
}

/** Reads, converts and validates the values of a section. */
function parseSection<V>(
  section: string,
  prefix: string,
  schema: TObject,
  transform?: (values: V) => V
): V {
  const input: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(schema.properties)) {
    const value = readSectionValue(prefix + key, property);
    if (value !== undefined) {
      input[key] = value;
    }
  }

  let values: V;
  try {
    values = Value.Parse(schema, input) as V;
  } catch {
    // The defaults are applied first, so only the invalid values are named,
    // each with its first error
    const checked = Value.Convert(
      schema,
      Value.Default(schema, structuredClone(input))
    );
    const errors: string[] = [];
    const named = new Set<string>();
    for (const error of Value.Errors(schema, checked)) {
      const key = error.path.split('/')[1] ?? '';
      if (named.has(key)) {
        continue;
      }
      named.add(key);
      errors.push(
        `${prefix + key} (config.${section}.${snakeToCamelCase(key.toLowerCase())}): ${error.message}`
      );
    }
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `Invalid config of section "${section}": ${errors.join(', ')}`,
      { errors }
    );
  }

  return transform ? transform(values) : values;
}

/** Reads the value of a key from the environment over the JSON files, converting an environment string. */
function readSectionValue(key: string, property: TSchema): unknown {
  const rawKey = `_${CONFIG_NAME}_${key}`;
  const mapFrom = property.mapFrom as string | undefined;
  const envValue =
    rawConfig.env[rawKey] ??
    (mapFrom ? rawConfig.env[`_${CONFIG_NAME}_${mapFrom}`] : undefined);

  if (typeof envValue === 'string' && envValue !== '') {
    if (property.type === 'array') {
      return parseArray(envValue, property.default);
    }
    if (property.type === 'boolean') {
      return ['true', 'on', 'yes', '1'].includes(envValue.toLowerCase().trim());
    }
    return envValue;
  }

  const jsonValue = rawConfig.json[rawKey];
  return isEmpty(jsonValue) ? undefined : jsonValue;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}
