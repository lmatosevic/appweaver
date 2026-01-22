import { config as dotenvConfig } from 'dotenv';
import { TObject } from '@sinclair/typebox';
import { parseArray } from '../utils';

export function loadConfigFromEnv(
  schema: TObject
): Record<string, string | string[]> {
  const config = {};

  // Load variables from the default .env file.
  dotenvConfig();

  // Load and override variables from the environment-specific .env.* file.
  dotenvConfig({ path: `.env.${process.env.NODE_ENV}`, override: true });

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
