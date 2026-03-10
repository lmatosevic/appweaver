import { TObject } from '@sinclair/typebox';
import { logger, MODEL } from '@appweaver/common';
import { define } from '../context';

export function registerModel(name: string, schema: TObject) {
  logger.debug({ model: name }, 'Registered model');

  define({ name, schema }, MODEL, 'append');
}
