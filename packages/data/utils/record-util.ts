import { TSchema } from '@sinclair/typebox';
import { capitalize, isArray, isPlainObject } from '@appweaver/common';
import { injectModel } from '@appweaver/core';

const MAX_DEPTH = 8;

/**
 * Projects a record the resource service returns (its virtual fields and relation counts set, its soft deleted
 * relations hidden) onto the response schema of its model, as its `find` route responds with it: without its hidden
 * fields or any field the schema does not declare, in its relations too. Used where a record leaves the application
 * without the response serializer of a route, i.e. a resource event or the result of an MCP tool.
 *
 * @param {string} modelName - The name of the model of the record.
 * @param {Object} record - The record, as the resource service returned it.
 * @return {Object} The projected record.
 */
export function projectRecord(modelName: string, record: unknown): unknown {
  return project(modelName, record, 0);
}

function project(
  modelName: string,
  record: unknown,
  depth: number,
  omit: string[] = []
): unknown {
  const model = injectModel(modelName, false);
  if (!model || !isPlainObject(record) || depth > MAX_DEPTH) {
    return model ? record : undefined;
  }

  const projected: Record<string, unknown> = {};

  for (const [key, schema] of Object.entries(properties(model.readOneModel))) {
    const value = (record as Record<string, unknown>)[key];
    if (value === undefined || omit.includes(key)) {
      continue;
    }

    // A relation omitting fields has the schema of its own, without a reference to follow
    const relation = model.config.relations?.[key];
    const related = relation
      ? capitalize(relation.model)
      : relatedModel(schema);
    const next = (item: unknown) =>
      project(related!, item, depth + 1, relation?.output?.omit);
    if (!related || value === null) {
      projected[key] = value;
    } else if (isArray(value)) {
      projected[key] = value.map(next);
    } else {
      projected[key] = next(value);
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
