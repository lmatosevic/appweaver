import { TSchema } from '@sinclair/typebox';
import { isArray, isPlainObject } from '@appweaver/common';
import { injectModel } from '@appweaver/core';
import { projectVirtualFields } from '@appweaver/data';

const MAX_DEPTH = 8;

/**
 * Projects a record of a resource event onto the response schema of its model, as its `find` route responds with
 * it: with its virtual fields, and without its hidden fields or any field the schema does not declare, relations
 * included.
 *
 * @param {string} modelName - The name of the model of the record.
 * @param {Object} record - The record, as the resource service returned it.
 * @return {Object} The projected record.
 */
export function projectRecord(modelName: string, record: unknown): unknown {
  return project(modelName, projectVirtualFields(record, modelName), 0);
}

function project(modelName: string, record: unknown, depth: number): unknown {
  const model = injectModel(modelName, false);
  if (!model || !isPlainObject(record) || depth > MAX_DEPTH) {
    return model ? record : undefined;
  }

  const projected: Record<string, unknown> = {};

  for (const [key, schema] of Object.entries(properties(model.readOneModel))) {
    const value = (record as Record<string, unknown>)[key];
    if (value === undefined) {
      continue;
    }

    const related = relatedModel(schema);
    if (!related || value === null) {
      projected[key] = value;
    } else if (isArray(value)) {
      projected[key] = value.map((item) => project(related, item, depth + 1));
    } else {
      projected[key] = project(related, value, depth + 1);
    }
  }

  return projected;
}

/** The properties of a model schema, the linked one of the TypeBox module of the models included. */
function properties(schema: TSchema): Record<string, TSchema> {
  const object: TSchema | undefined =
    schema.properties || !schema.$ref ? schema : schema.$defs?.[schema.$ref];
  return object?.properties ?? {};
}

/** The name of the model a relation property references, i.e. `User` of `{ $ref: 'UserSingle' }`. */
function relatedModel(schema: TSchema): string | undefined {
  const ref: string | undefined =
    schema.$ref ??
    schema.items?.$ref ??
    schema.anyOf?.find((s: TSchema) => s.$ref)?.$ref ??
    schema.anyOf?.find((s: TSchema) => s.items?.$ref)?.items?.$ref;

  return ref?.replace(/(SingleNullable|Single|Multiple)$/, '');
}
