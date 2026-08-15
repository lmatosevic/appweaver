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
  RelationField,
  ResourceModel,
  ResourcePolicyConfig,
  ResourceRoutes,
  ScalarField
} from '../types';
import { IResourceService } from '../interfaces';
import { isArray, isConstructor, isPlainObject } from './type-util';

/**
 * Maps every resource model schema name suffix to the {@link ResourceModel}
 * property holding that schema variant. Iterating this record yields all schema
 * variants of a model together with the name they are registered under, which is
 * always the model name followed by the suffix (e.g. `PostCreate`).
 */
export const resourceModelProps: Record<
  string,
  keyof Partial<Omit<ResourceModel, 'name' | 'config'>>
> = {
  '': 'readModel',
  Single: 'readOneModel',
  Multiple: 'readManyModel',
  Create: 'createOneModel',
  Update: 'updateOneModel',
  RelationCreate: 'relationCreateModel',
  RelationUpdate: 'relationUpdateModel',
  RelationInput: 'relationInputModel',
  Relations: 'relationsModel',
  Virtual: 'virtualModel',
  Files: 'filesModel',
  FileUpload: 'fileUploadModel',
  FileDelete: 'fileDeleteModel'
};

/**
 * Reads the resource name annotation off a model schema. Array schemas are
 * unwrapped first, so both a resource schema and a list of that resource resolve
 * to the same name.
 *
 * @param {TSchema} [schema] - The schema to read the resource name from.
 * @return {string | undefined} The annotated resource name, or `undefined` when
 * no schema was given or the schema carries no resource name.
 */
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

/**
 * Resolves the properties of a model schema, or a single property of it, following
 * any `$ref` indirection through the schema `$defs`. Referenced definitions are
 * dereferenced so that callers can read annotations such as the resource name off
 * the returned schema, while array fields keep their array wrapper so that to-many
 * fields stay distinguishable from to-one fields.
 *
 * @param {TSchema} [schema] - The model schema to inspect.
 * @param {string} [key] - Name of a single property to resolve. When omitted, the
 * whole properties object is returned.
 * @return {TSchema | undefined} The properties object, the resolved property
 * schema, or `undefined` when no schema was given or the property does not exist.
 */
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

/**
 * Builds the name of the virtual field holding the number of related records for
 * the given to-many relation field.
 *
 * @param {string} name - Name of the relation field.
 * @return {string} The corresponding count field name.
 */
export function countFieldName(name: string): string {
  return `${name}Count`;
}

/**
 * Determines whether a field name refers to a relation count field produced by
 * {@link countFieldName}, which has no counterpart in the model schema and
 * therefore has to be projected instead of selected.
 *
 * @param {string} name - The field name to check.
 * @return {boolean} True when the name denotes a count field.
 */
export function isCountField(name: string): boolean {
  return name.endsWith('Count');
}

/**
 * Reads a marker symbol off a value regardless of how it was declared or which shape the value has. Markers may sit on
 * the value itself, on its class as a static member, or on its prototype, and the application context replaces a
 * registered class with its instance the first time it is injected, so both shapes have to keep resolving.
 *
 * @param {any} value - The value to read the marker from.
 * @param {symbol} marker - The marker symbol to look up.
 * @return {any} The marker value, or `undefined` when the value carries it in no shape.
 */
export function readMarker(value: any, marker: symbol): any {
  return (
    value?.[marker] ??
    value?.constructor?.[marker] ??
    value?.prototype?.[marker]
  );
}

/**
 * Determines whether the given value is a resource model created by
 * `createModel` or `createAuthModel`.
 *
 * @param {any} value - The value to check.
 * @return {boolean} True when the value is a resource model.
 */
export function isResourceModel(value: any): value is ResourceModel {
  return (
    isPlainObject(value) &&
    readMarker(value, RESOURCE_TYPE) === RESOURCE_MODEL_TYPE
  );
}

/**
 * Determines whether the given value is a resource model that acts as the
 * authentication model of the application, i.e. one created by `createAuthModel`.
 *
 * @param {any} value - The value to check.
 * @return {boolean} True when the value is an authentication resource model.
 */
export function isResourceAuthModel(value: any): value is ResourceModel {
  return isResourceModel(value) && !!readMarker(value, RESOURCE_AUTH);
}

/**
 * Determines whether the given value is a resource service created by
 * `createService` or `createAuthService`. Both service instances and the service
 * classes themselves are recognized, since resources may export either one.
 *
 * @param {any} value - The value to check.
 * @return {boolean} True when the value is a resource service or service class.
 */
export function isResourceService(value: any): value is IResourceService {
  return (
    (isPlainObject(value) || isConstructor(value)) &&
    readMarker(value, RESOURCE_TYPE) === RESOURCE_SERVICE_TYPE
  );
}

/**
 * Determines whether the given value is a resource service belonging to the
 * authentication resource, i.e. one created by `createAuthService`.
 *
 * @param {any} value - The value to check.
 * @return {boolean} True when the value is an authentication resource service.
 */
export function isResourceAuthService(value: any): value is IResourceService {
  return isResourceService(value) && !!readMarker(value, RESOURCE_AUTH);
}

/**
 * Determines whether the given value is a resource routes definition created by
 * `createRoutes`.
 *
 * @param {any} value - The value to check.
 * @return {boolean} True when the value is a resource routes definition.
 */
export function isResourceRoutes(value: any): value is ResourceRoutes {
  return (
    isPlainObject(value) &&
    readMarker(value, RESOURCE_TYPE) === RESOURCE_ROUTES_TYPE
  );
}

/**
 * Determines whether the given value is a resource policy configuration created by
 * `createPolicy`.
 *
 * @param {any} value - The value to check.
 * @return {boolean} True when the value is a resource policy configuration.
 */
export function isResourcePolicy(value: any): value is ResourcePolicyConfig {
  return (
    isPlainObject(value) &&
    readMarker(value, RESOURCE_TYPE) === RESOURCE_POLICY_TYPE
  );
}

/**
 * Determines whether a relation field holds a list of related records. This is
 * the case for both sides of a `manyToMany` relation and the inverse (non-owning)
 * side of a `oneToMany` relation.
 *
 * @param {Pick<RelationField, 'type' | 'owner'>} relation - The relation field configuration.
 * @return {boolean} True when the relation resolves to a list of related records.
 */
export function isRelationArray(
  relation: Pick<RelationField, 'type' | 'owner'>
): boolean {
  return (
    relation.type === 'manyToMany' ||
    (relation.type === 'oneToMany' && relation.owner !== true)
  );
}

/**
 * Determines whether a relation field is the owning side of the relation, i.e.
 * the side that holds the foreign key column in the generated table. Only
 * `oneToOne` and `oneToMany` relations can have an owning side.
 *
 * @param {Pick<RelationField, 'type' | 'owner'>} relation - The relation field configuration.
 * @return {boolean} True when the relation holds the foreign key column.
 */
export function isRelationOwner(
  relation: Pick<RelationField, 'type' | 'owner'>
): boolean {
  return relation.type !== 'manyToMany' && relation.owner === true;
}

/**
 * Resolves the empty default value for a scalar field, used wherever a value has
 * to be materialized for a field that was not provided. Array scalars default to an
 * empty list regardless of their element type, and enum scalars fall back to their
 * first allowed value.
 *
 * @param {ScalarField} scalar - The scalar field configuration.
 * @return {FieldDefault} The default value matching the scalar type.
 */
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
