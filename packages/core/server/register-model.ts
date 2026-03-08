import { TObject } from '@sinclair/typebox';
import { logger } from '@appweaver/common';
import { define } from '../context';
import { MODEL } from '../constants';

export function registerModel(name: string, schema: TObject) {
  logger.debug({ model: name }, 'Registered model');

  define({ name, schema }, MODEL, 'append');
}
