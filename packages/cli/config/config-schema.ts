import { ConfigSectionDefinition, snakeToCamelCase } from '@appweaver/common';

type JsonSchema = Record<string, any>;

/**
 * Builds the JSON Schema of the `appweaver.json` file from the config sections of the application, the one its
 * `$schema` points to. A TypeBox schema is a JSON Schema, so each key keeps its type and default, under its camelCase
 * name in the nested object of its section.
 *
 * @param {Iterable<ConfigSectionDefinition>} sections - The registered config sections.
 * @return {JsonSchema} The JSON Schema of the file.
 */
export function buildConfigSchema(
  sections: Iterable<ConfigSectionDefinition>
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
    definitions: { config }
  };
}
