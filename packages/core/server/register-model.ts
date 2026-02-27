import { TObject } from '@sinclair/typebox';
import { define } from '../context';
import { MODEL } from '../constants';

export function registerModel(name: string, schema: TObject) {
  define({ name, schema }, MODEL, true);
}
