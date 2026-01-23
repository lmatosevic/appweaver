import * as fs from 'node:fs';
import * as path from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { TObject } from '@sinclair/typebox';
import { camelToSnakeCase, parseArray } from '../utils';
import { APPWEAVER } from '../constants';

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

  const variables = recurseConfig(data, {});

  for (const [name, value] of Object.entries(variables)) {
    const schemaProp = schema.properties[name];
    if (!schemaProp || value === null || value === undefined || value === '') {
      continue;
    }

    config[name] = value;
  }

  return config;
}

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
