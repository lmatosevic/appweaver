import { TObject, TSchema } from '@sinclair/typebox';
import {
  FieldDefault,
  resourceModelProps,
  ScalarField
} from '@appweaver/common';
import { context } from '../context';
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

export function extractSchemaProperties(
  schema?: TSchema,
  key?: string
): TSchema | undefined {
  let properties: TSchema | undefined;

  if (schema && '$ref' in schema && '$defs' in schema) {
    properties = schema['$defs'][schema['$ref']]?.properties;
  } else {
    properties = schema?.properties;
  }

  return key ? properties?.[key] : properties;
}

export function extractSchemaValue(schemaName: string): TObject | undefined {
  for (const [name, model] of Object.entries(context.models)) {
    if (!schemaName.startsWith(name)) {
      continue;
    }

    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      const modelName = `${name}${suffix}`;
      const modelSchema = model[property].$defs[modelName];
      if (modelName === schemaName) {
        return modelSchema;
      }
    }
  }
}

export function countFieldName(name: string): string {
  return `${name}Count`;
}

export function isCountField(name: string): boolean {
  return name.endsWith('Count');
}

export function defaultScalarValue(scalar: ScalarField): FieldDefault {
  if (scalar.array) {
    return [];
  }

  switch (scalar.type) {
    case 'string':
      return '';
    case 'int':
    case 'bigInt':
    case 'float':
      return 0;
    case 'boolean':
      return false;
    case 'dateTime':
      return new Date();
    case 'json':
      return {};
    case 'enum':
      return scalar.values?.[0] ?? '';
  }
}
