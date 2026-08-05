import { TSchema } from '@sinclair/typebox';
import {
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_NAME,
  RESOURCE_POLICY_TYPE,
  RESOURCE_ROUTES_TYPE,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE
} from '../constants';
import {
  FieldDefault,
  ResourceModel,
  ResourcePolicyConfig,
  ResourceRoutes,
  ScalarField
} from '../types';
import { IResourceService } from '../interfaces';
import { isArray, isConstructor, isPlainObject } from './type-util';

export const resourceModelProps: Record<
  string,
  keyof Partial<Omit<ResourceModel, 'name' | 'config'>>
> = {
  '': 'readModel',
  Single: 'readOneModel',
  Multiple: 'readManyModel',
  Create: 'createOneModel',
  Update: 'updateOneModel',
  Relations: 'relationsModel',
  Virtual: 'virtualModel',
  Files: 'filesModel',
  FileUpload: 'fileUploadModel',
  FileDelete: 'fileDeleteModel'
};

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
  if (!schema) {
    return undefined;
  }

  const defs = schema['$defs'];

  const properties =
    '$ref' in schema && defs
      ? defs[schema['$ref']]?.properties
      : schema.properties;

  if (!key) {
    return properties;
  }

  const field = properties?.[key];
  if (!field) {
    return undefined;
  }

  // Nullable single relation and file fields are wrapped in a union with null
  if (isArray(field['anyOf'])) {
    const ref = field['anyOf'].find((entry: TSchema) => '$ref' in entry)?.[
      '$ref'
    ];
    return ref ? defs?.[ref] : undefined;
  }

  // Required single relation and file fields reference the target model
  // directly, so the definition has to be resolved for the caller to be able
  // to read the resource name off it.
  if ('$ref' in field) {
    return defs?.[field['$ref']] ?? field;
  }

  // Array relation and file fields keep their array wrapper, since callers
  // distinguish to-many from to-one fields by the `array` schema type.
  if (field['items'] && '$ref' in field['items']) {
    const resolved = defs?.[field['items']['$ref']];
    return resolved ? { ...field, items: resolved } : field;
  }

  return field;
}

export function countFieldName(name: string): string {
  return `${name}Count`;
}

export function isCountField(name: string): boolean {
  return name.endsWith('Count');
}

export function isResourceModel(value: any): value is ResourceModel {
  return isPlainObject(value) && value[RESOURCE_TYPE] === RESOURCE_MODEL_TYPE;
}

export function isResourceAuthModel(value: any): value is ResourceModel {
  return isResourceModel(value) && value[RESOURCE_AUTH];
}

export function isResourceService(value: any): value is IResourceService {
  return (
    (isPlainObject(value) || isConstructor(value)) &&
    value[RESOURCE_TYPE] === RESOURCE_SERVICE_TYPE
  );
}

export function isResourceAuthService(value: any): value is IResourceService {
  return isResourceService(value) && value[RESOURCE_AUTH];
}

export function isResourceRoutes(value: any): value is ResourceRoutes {
  return isPlainObject(value) && value[RESOURCE_TYPE] === RESOURCE_ROUTES_TYPE;
}

export function isResourcePolicy(value: any): value is ResourcePolicyConfig {
  return isPlainObject(value) && value[RESOURCE_TYPE] === RESOURCE_POLICY_TYPE;
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
