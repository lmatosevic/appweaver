import { TObject, TSchema, Type } from '@sinclair/typebox';
import {
  AuditFields,
  capitalize,
  countFieldName,
  isRelationArray,
  ResourceModel,
  StringEnum
} from '@appweaver/common';
import { context } from '../../context';
import { createSchemaModel } from '../../utils';

/**
 * Resolves the schema name the query sort object of a model is registered under.
 *
 * @param {string} modelName The resource model name (i.e. `User`, `Post`).
 * @returns {string} The query sort schema name (i.e. `UserQuerySort`).
 */
export const querySortName = (modelName: string): string =>
  `${modelName}QuerySort`;

/** The accepted sort directions of a single field. */
const SORT_DIRECTIONS = ['asc', 'desc'];

const SortDirection = (): TSchema =>
  Type.Optional(StringEnum(SORT_DIRECTIONS, { example: 'desc' }));

/**
 * Builds the query sort schema of a resource model, mirroring the ORDER BY part
 * of a database query. Every sortable field of the model is declared explicitly,
 * so the request validation keeps the known fields and strips everything else.
 * Scalar fields accept a sort direction, to-one relations accept the sort object
 * of the related model, and to-many relations accept a direction applied to
 * their related record count, both under the relation name and under its count
 * field name.
 *
 * @param {ResourceModel} model The resource model to build the sort schema for.
 * @returns {TObject} The query sort schema of the model.
 */
export function buildQuerySortSchema(model: ResourceModel): TObject {
  const properties: Record<string, TSchema> = {
    id: SortDirection()
  };

  const auditFields: AuditFields = {
    updatedAt: true,
    createdAt: true,
    createdById: true,
    ...(model.config.audit ?? {})
  };
  for (const [fieldName, included] of Object.entries(auditFields)) {
    if (included) {
      properties[fieldName] = SortDirection();
    }
  }

  // Array scalars hold no single value to order by, and virtual fields have no
  // column of their own, so neither of them is sortable
  for (const [fieldName, scalar] of Object.entries(
    model.config.scalars ?? {}
  )) {
    if (scalar.hidden || scalar.array) {
      continue;
    }
    properties[fieldName] = SortDirection();
  }

  // A relation holding a list of records is ordered by their count, under the
  // relation name and under its count field name alike
  for (const [fieldName, relation] of Object.entries(
    model.config.relations ?? {}
  )) {
    if (isRelationArray(relation)) {
      properties[fieldName] = SortDirection();
      properties[countFieldName(fieldName)] = SortDirection();
      continue;
    }
    properties[fieldName] = Type.Optional(
      Type.Ref(querySortName(capitalize(relation.model)))
    );
  }

  for (const [fieldName, file] of Object.entries(model.config.files ?? {})) {
    if (file.array) {
      properties[fieldName] = SortDirection();
      properties[countFieldName(fieldName)] = SortDirection();
      continue;
    }
    properties[fieldName] = Type.Optional(Type.Ref(querySortName('File')));
  }

  return Type.Object(properties, {
    description:
      `Query sort for the ${model.name} resource, applying its fields in the ` +
      'order they are declared. A nested object sorts by a field of a relation, ' +
      'which has to be included in the response.'
  });
}

/**
 * Registers the query sort schema of every loaded resource model on the server,
 * so route schemas can reference them by name (i.e. `UserQuerySort`). Schemas
 * already registered under the same name are skipped, which makes repeated calls
 * cheap.
 */
export function registerQuerySortSchemas(): void {
  for (const model of context.resource.models.values()) {
    createSchemaModel(buildQuerySortSchema(model), {
      name: querySortName(model.name)
    });
  }
}

/**
 * Builds the schema of the sort property of a model, accepting either a
 * comma-separated field list or the query sort object of the model.
 *
 * @param {string} modelName The resource model name the sort property belongs to.
 * @returns {TSchema} The optional sort property schema.
 */
export function querySortSchema(modelName: string): TSchema {
  return Type.Optional(
    Type.Union(
      [
        Type.String({
          example: '-createdAt,title',
          description:
            'Comma-separated list of fields to sort by, where a field prefixed ' +
            'with `-` is sorted in descending order and a dot notation path ' +
            'targets a field of an included relation'
        }),
        Type.Ref(querySortName(modelName))
      ],
      {
        description:
          'Fields to sort the results by, given as a comma-separated field list ' +
          'or as an object of field directions'
      }
    )
  );
}
