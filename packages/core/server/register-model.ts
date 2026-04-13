import { TObject } from '@sinclair/typebox';
import { logger } from '@appweaver/common';
import { createSchemaModel } from '../utils';

export function registerModel(schema: TObject, name?: string): void {
  const refType = createSchemaModel(schema, {
    name,
    addToServer: false
  });

  logger.debug({ modelName: refType.$ref }, 'Registered model');
}
