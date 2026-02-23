import { TSchema } from '@sinclair/typebox';
import {
  FieldDefault,
  isObject,
  ResourcePolicyConfig,
  ScalarField
} from '@appweaver/common';
import { IResourceService, ResourceModel, ResourceRoutes } from '../types';
import {
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_NAME,
  RESOURCE_POLICY_TYPE,
  RESOURCE_ROUTES_TYPE,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE
} from '../constants';

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
  let properties: TSchema | undefined;

  if (schema && '$ref' in schema && '$defs' in schema) {
    properties = schema['$defs'][schema['$ref']]?.properties;
  } else {
    properties = schema?.properties;
  }

  return key ? properties?.[key] : properties;
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

export function isResourceAuthModel(value: any): value is ResourceModel {
  return isResourceModel(value) && value[RESOURCE_AUTH];
}

export function isResourceService(value: any): value is IResourceService {
  return isObject(value) && value[RESOURCE_TYPE] === RESOURCE_SERVICE_TYPE;
}

export function isResourceAuthService(value: any): value is IResourceService {
  return isResourceService(value) && value[RESOURCE_AUTH];
}

export function isResourceRoutes(value: any): value is ResourceRoutes {
  return isObject(value) && value[RESOURCE_TYPE] === RESOURCE_ROUTES_TYPE;
}

export function isResourcePolicy(value: any): value is ResourcePolicyConfig {
  return isObject(value) && value[RESOURCE_TYPE] === RESOURCE_POLICY_TYPE;
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
