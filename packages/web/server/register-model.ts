import { TObject } from '@sinclair/typebox';
import { createLogger } from '@appweaver/common';
import { createSchemaModel } from '@appweaver/core';

const logger = createLogger('server');

/**
 * Registers a schema model, documented in the OpenAPI specification and referenced by its name from the route
 * schemas.
 *
 * @param {TObject} schema - The model schema.
 * @param {string} [name] - The model name, the `$id` or `title` of the schema by default.
 */
export function registerModel(schema: TObject, name?: string): void {
  const refType = createSchemaModel(schema, {
    name,
    addToServer: false
  });

  logger.debug({ modelName: refType.$ref }, 'Registered model');
}
