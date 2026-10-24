import { TObject, TSchema, Type } from '@sinclair/typebox';
import { IdField, idFieldType, Nullable, StringDate } from '@appweaver/common';

// Maximum length of a string primary key, sized for the longest value the
// supported generators produce (a 36-character UUID)
export const ID_STRING_MAX_LENGTH = 36;

export const Id = Type.Object({
  id: Type.Integer({ minimum: 1, example: 1 })
});

export const IdString = Type.Object({
  id: Type.String({ maxLength: ID_STRING_MAX_LENGTH, example: 'a1b2c3d4' })
});

/**
 * Builds the schema of a single primary key value, used wherever an id is
 * accepted on its own (i.e. a relation input connecting an existing record).
 *
 * @param {IdField} [idField] - The id configuration, integer by default.
 * @return {TSchema} The schema of the id value.
 */
export function idValueSchema(idField?: IdField): TSchema {
  return idFieldType(idField) === 'string'
    ? IdString.properties.id
    : Id.properties.id;
}

/**
 * Builds the primary key schema of a model, used as the route path parameter
 * and as the connection shape of the relation inputs pointing at the model. A
 * fresh object per call, since each model annotates its own schemas.
 *
 * @param {IdField} [idField] - The id configuration, integer by default.
 * @return {TObject} The primary key schema of the model.
 */
export function idSchema(idField?: IdField): TObject {
  return Type.Object({ id: idValueSchema(idField) });
}

/**
 * Builds the audit field schema of a model. The `createdById` field references
 * the authentication model, so it follows that model's id type.
 *
 * @param {IdField} [authIdField] - The auth model id configuration, integer by default.
 * @return {TObject} The schema holding all supported audit fields.
 */
export function auditSchema(authIdField?: IdField): TObject {
  return Type.Object({
    updatedAt: StringDate(),
    createdAt: StringDate(),
    createdById: Nullable(idValueSchema(authIdField))
  });
}
