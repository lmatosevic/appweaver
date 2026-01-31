import * as fs from 'node:fs';
import * as path from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { TObject } from '@sinclair/typebox';
import { camelToSnakeCase, parseArray } from '../utils';
import { APPWEAVER } from '../constants';

/**
 * Loads configuration values from the environment variables based on the provided schema object.
 * Supports parsing environment variables into scalar or array values as defined in the schema.
 * Automatically handles loading of `.env` files (default and environment-specific).
 *
 * @param {TObject} schema The schema object that defines the expected structure and mapping of configuration properties.
 *                         Each property in the schema should include `type`, `mapFrom`, and optionally `default` definitions.
 * @return {Record<string, string | string[]>} An object containing the configuration values mapped according to the schema.
 *                                             Values can be strings or arrays based on the schema specifications.
 */
export function loadConfigFromEnv(
  schema: TObject
): Record<string, string | string[]> {
  const config = {};

  // Load variables from the default .env file.
  dotenvConfig({ quiet: true });

  // Load and override variables from the environment-specific .env.* file.
  dotenvConfig({
    path: `.env.${process.env.NODE_ENV}`,
    override: true,
    quiet: true
  });

  const variables = Object.entries({ ...process.env });

  // Create configuration based on the provided schema object properties using
  // environment variables loaded from default and environment-specific files.
  for (let i = 0; i < variables.length; i++) {
    let name = variables[i][0];
    const value = variables[i][1];

    const mapToProp = Object.entries(schema.properties).find(
      ([_, v]) => v.mapFrom === name
    );
    if (mapToProp) {
      name = mapToProp[0];
    }

    const schemaProp = schema.properties[name];
    if (!schemaProp || !value) {
      continue;
    }

    if (schemaProp.type === 'array') {
      config[name] = parseArray(value, schemaProp.default);
    } else {
      config[name] = value;
    }
  }

  return config;
}

/**
 * Loads configuration from multiple JSON files based on the provided schema.
 *
 * @param {TObject} schema - The schema used to validate and parse the configuration files.
 * @return {Record<string, string | string[]>} An object containing the merged configuration data
 *                                             from the global and environment-specific files.
 */
export function loadConfigFromFiles(
  schema: TObject
): Record<string, string | string[]> {
  const globalConfig = loadConfigFromFile(schema, `./${APPWEAVER}.json`);
  const envConfig = loadConfigFromFile(
    schema,
    `./${APPWEAVER}.${process.env.NODE_ENV}.json`
  );
  return { ...globalConfig, ...envConfig };
}

/**
 * Loads configuration data from a specified file and validates it against a given schema.
 *
 * @param {TObject} schema - The schema to validate the configuration data against.
 * @param {string} filePath - The path to the configuration file.
 * @return {Record<string, string | string[]>} A record containing the validated configuration data.
 * Invalid or unspecified properties are omitted from the result.
 */
export function loadConfigFromFile(
  schema: TObject,
  filePath: string
): Record<string, string | string[]> {
  const config = {};

  const absoluteFilePath = path.resolve(filePath);
  if (!fs.existsSync(absoluteFilePath)) {
    return config;
  }

  const rawData = fs.readFileSync(absoluteFilePath, 'utf8');
  const data = JSON.parse(rawData);

  const variables = recurseConfig(data.config ?? {}, {});

  for (const [name, value] of Object.entries(variables)) {
    const schemaProp = schema.properties[name];
    if (!schemaProp || value === null || value === undefined || value === '') {
      continue;
    }

    config[name] = value;
  }

  return config;
}

/**
 * Recursively processes a map of configurations and flattens its key structure
 * into a single record with snake_case uppercase keys joined by underscores.
 *
 * @param current A map containing nested configuration data. Keys can map to strings or arrays of strings.
 * @param config A record where the processed key-value pairs will be stored. Keys will be transformed and flattened.
 * @param pathParts An array of strings representing the current path in the nested structure. Optional, defaults to an empty array.
 * @return A record containing the flattened configuration with transformed keys and the associated values.
 */
function recurseConfig(
  current: Map<string, string | string[]>,
  config: Record<string, string | string[]>,
  pathParts: string[] = []
): Record<string, string | string[]> {
  if (
    current !== null &&
    typeof current === 'object' &&
    !Array.isArray(current)
  ) {
    for (const [k, v] of Object.entries(current)) {
      recurseConfig(v, config, [
        ...pathParts,
        camelToSnakeCase(k).toUpperCase()
      ]);
    }
  } else {
    const key = pathParts.join('_');
    config[key] = current;
  }

  return config;
}
