import { TSchema } from '@sinclair/typebox';
import { ResourceNameSymbol } from '../constants';

export function extractResourceName(schema?: TSchema): string | undefined {
  if (!schema) {
    return undefined;
  }

  if (schema?.type === 'array' && ResourceNameSymbol in schema.items) {
    return schema.items[ResourceNameSymbol];
  }

  if (schema?.type !== 'array' && ResourceNameSymbol in schema) {
    return schema[ResourceNameSymbol] as string;
  }

  return undefined;
}

export function countFieldName(name: string): string {
  return `${name}Count`;
}

export function isCountField(name: string): boolean {
  return name.endsWith('Count');
}
