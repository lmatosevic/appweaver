import { TObject, TSchema } from '@sinclair/typebox';
import {
  FieldDefault,
  isObject,
  ResourceModel,
  resourceModelProps,
  ResourcePolicyConfig,
  ScalarField
} from '@appweaver/common';
import { context } from '../context';
import { ResourceService } from '../resource';
import {
  RESOURCE_MODEL_TYPE,
  RESOURCE_NAME,
  RESOURCE_POLICY_TYPE,
  RESOURCE_ROUTES_TYPE,
  RESOURCE_TYPE
} from '../constants';
import { ResourceRoutes } from '../types';

export function extractResourceName(schema?: TSchema): string | undefined {
  if (!schema) {
    return undefined;
  }

  if (schema?.type === 'array' && RESOURCE_NAME in schema.items) {
    return schema.items[RESOURCE_NAME];
  }

  if (schema?.type !== 'array' && RESOURCE_NAME in schema) {
    return schema[RESOURCE_NAME] as string;
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

export function isResourceModel(value: any): value is ResourceModel {
  return isObject(value) && value[RESOURCE_TYPE] === RESOURCE_MODEL_TYPE;
}

export function isResourceRoutes(value: any): value is ResourceRoutes {
  return isObject(value) && value[RESOURCE_TYPE] === RESOURCE_ROUTES_TYPE;
}

export function isResourcePolicy(value: any): value is ResourcePolicyConfig {
  return isObject(value) && value[RESOURCE_TYPE] === RESOURCE_POLICY_TYPE;
}

export function isResourceService(value: any): value is ResourceService {
  return isObject(value) && value[RESOURCE_TYPE] === RESOURCE_ROUTES_TYPE;
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
