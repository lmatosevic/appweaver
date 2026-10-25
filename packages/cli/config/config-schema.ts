import fsp from 'node:fs/promises';
import { ConfigSectionDefinition, snakeToCamelCase } from '@appweaver/common';
import { ensureDirExists } from '../utils/path-util';

type JsonSchema = Record<string, any>;

/**
 * Writes the JSON Schema of the `appweaver.json` file, built from the config sections.
 *
 * @param {Iterable<ConfigSectionDefinition>} sections - The registered config sections.
 * @param {string} outputPath - The path of the schema file, i.e. `./appweaver.schema.json`.
 * @param {Iterable<string>} [loggerNames] - The logger names of the enabled modules, suggested in `log.levels`.
 */
export async function writeConfigSchema(
  sections: Iterable<ConfigSectionDefinition>,
  outputPath: string,
  loggerNames: Iterable<string> = []
): Promise<void> {
  await ensureDirExists(outputPath);
  await fsp.writeFile(
    outputPath,
    JSON.stringify(buildConfigSchema(sections, loggerNames), null, 2) + '\n',
    'utf8'
  );
}

/**
 * Builds the JSON Schema of the `appweaver.json` file from the config sections of the application, the one its
 * `$schema` points to. A TypeBox schema is a JSON Schema, so each key keeps its type and default, under its camelCase
 * name in the nested object of its section. The logger names become the properties of `log.levels`, so an editor
 * suggests them, while any other name still matches the pattern of the record.
 *
 * @param {Iterable<ConfigSectionDefinition>} sections - The registered config sections.
 * @param {Iterable<string>} [loggerNames] - The logger names of the enabled modules, i.e. `database`.
 * @return {JsonSchema} The JSON Schema of the file.
 */
export function buildConfigSchema(
  sections: Iterable<ConfigSectionDefinition>,
  loggerNames: Iterable<string> = []
): JsonSchema {
  const config: JsonSchema = { type: 'object', properties: {} };

  for (const { section, schema } of [...sections].sort((a, b) =>
    a.section.localeCompare(b.section)
  )) {
    let node = config;
    for (const part of section.split('.')) {
      node.properties[part] ??= { type: 'object', properties: {} };
      node = node.properties[part];
    }
    for (const [key, property] of Object.entries(schema.properties)) {
      // Drops the TypeBox symbols and the options only TypeBox reads
      const { mapFrom: _mapFrom, ...json } = JSON.parse(
        JSON.stringify(property)
      );
      node.properties[snakeToCamelCase(key.toLowerCase())] = json;
    }
  }

  const definitions: JsonSchema = { config };

  // The level of each logger name refers to one definition, instead of repeating its enum
  const levels = config.properties.log?.properties.levels;
  const [pattern, level] =
    Object.entries(levels?.patternProperties ?? {})[0] ?? [];
  if (level) {
    definitions.logLevel = level;
    const ref = { $ref: '#/definitions/logLevel' };
    levels.patternProperties = { [pattern]: ref };
    const names = [...new Set(loggerNames)].sort();
    if (names.length > 0) {
      levels.properties = Object.fromEntries(names.map((name) => [name, ref]));
    }
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema',
    title: 'Appweaver Workspace Configuration',
    type: 'object',
    additionalProperties: false,
    properties: {
      $schema: { type: 'string' },
      config: {
        description: 'Base configuration, applied in every environment.',
        $ref: '#/definitions/config'
      },
      environments: {
        type: 'object',
        description:
          'Configuration of each environment, keyed by the environment name and merged over `config`.',
        additionalProperties: { $ref: '#/definitions/config' }
      }
    },
    definitions
  };
}
