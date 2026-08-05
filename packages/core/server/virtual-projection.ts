import { preSerializationAsyncHookHandler } from 'fastify';
import {
  extractResourceName,
  extractSchemaProperties,
  isArray,
  isPlainObject,
  isString,
  logger
} from '@appweaver/common';
import { injectModel } from '../context';
import { projectVirtualFields } from '../utils';

/** Path segment marking an array level inside a projection path. */
const ARRAY_SEGMENT = '[]';

/**
 * Schema `$id` suffixes of resource output models that represent a single resource instance. Longer suffixes are
 * matched first so that `PostSingle` resolves to the `Post` model instead of a (nonexistent) `PostSingle` model.
 */
const INSTANCE_SUFFIXES = ['Single', 'Multiple', ''];

export type VirtualProjectionEntry = {
  path: string[];
  resourceName: string;
};

export type VirtualProjectionPlan = Record<string, VirtualProjectionEntry[]>;

/**
 * Builds a virtual field projection plan from route response schemas. Each 2xx response schema is walked, resolving
 * `$ref` references through the provided schema lookup, and every location referencing a resource output model
 * (`<Name>`, `<Name>Single` or `<Name>Multiple`) whose model defines virtual fields — directly or through nested
 * relations and files — is recorded as a payload path to project before serialization.
 *
 * @param {Record<string, unknown>} [responseSchemas] - The route `schema.response` object keyed by status code.
 * @param {(id: string) => unknown} getSchema - Lookup function resolving a schema `$id` to its schema object.
 * @return {VirtualProjectionPlan} Projection entries grouped by response status code, empty when no resource output
 * models with virtual fields are referenced.
 */
export function buildVirtualProjectionPlan(
  responseSchemas: Record<string, unknown> | undefined,
  getSchema: (id: string) => unknown
): VirtualProjectionPlan {
  const plan: VirtualProjectionPlan = {};

  for (const [status, schema] of Object.entries(responseSchemas ?? {})) {
    if (!/^2(\d\d|xx)$/i.test(status)) {
      continue;
    }

    const entries: VirtualProjectionEntry[] = [];
    collectProjectionEntries(schema, [], entries, getSchema, new Set());

    if (entries.length > 0) {
      plan[status.toLowerCase()] = entries;
    }
  }

  return plan;
}

/**
 * Creates a Fastify `preSerialization` hook that applies a virtual field projection plan to the response payload.
 * Projection failures are logged and never fail the request — the original payload is returned instead.
 *
 * @param {VirtualProjectionPlan} plan - The projection plan built from the route response schemas.
 * @return {preSerializationAsyncHookHandler} The `preSerialization` hook applying the plan.
 */
export function createVirtualProjectionHook(
  plan: VirtualProjectionPlan
): preSerializationAsyncHookHandler {
  return async (_request, reply, payload) => {
    const entries = plan[String(reply.statusCode)] ?? plan['2xx'];

    if (!entries?.length || (!isPlainObject(payload) && !isArray(payload))) {
      return payload;
    }

    try {
      let projected = payload;
      for (const entry of entries) {
        projected = applyProjection(
          projected,
          entry.path,
          0,
          entry.resourceName
        );
      }
      return projected;
    } catch (e) {
      logger.warn(e, 'Error projecting virtual fields on response payload');
      return payload;
    }
  };
}

/**
 * Recursively walks a response schema and collects the payload paths at which resource output models appear. Resolves
 * `$ref` references through the schema lookup, unwraps OpenAPI media type `content` objects, descends into `allOf` /
 * `anyOf` / `oneOf` branches, and appends an {@link ARRAY_SEGMENT} marker for every array level entered.
 *
 * @param {unknown} schema - The schema node currently being walked, ignored when it is not an object.
 * @param {string[]} path - Payload path segments accumulated from the response root to the current node.
 * @param {VirtualProjectionEntry[]} entries - Accumulator the collected projection entries are pushed into.
 * @param {(id: string) => unknown} getSchema - Lookup function resolving a schema `$id` to its schema object.
 * @param {Set<string>} visitedRefs - Schema `$id`s already resolved along the current descent, guarding against
 * circular references.
 * @return {void}
 */
function collectProjectionEntries(
  schema: unknown,
  path: string[],
  entries: VirtualProjectionEntry[],
  getSchema: (id: string) => unknown,
  visitedRefs: Set<string>
): void {
  if (!isPlainObject(schema)) {
    return;
  }

  if (isString(schema['$ref'])) {
    const refName = schema['$ref'].replace(/#$/, '');
    if (recordInstanceEntry(refName, path, entries)) {
      return;
    }
    // Guard against circular schema references along the current descent
    if (visitedRefs.has(refName)) {
      return;
    }
    collectProjectionEntries(
      getSchema(refName),
      path,
      entries,
      getSchema,
      new Set([...visitedRefs, refName])
    );
    return;
  }

  if (
    isString(schema['$id']) &&
    recordInstanceEntry(schema['$id'], path, entries)
  ) {
    return;
  }

  // OpenAPI-style response objects wrap the schema in media type content
  if (isPlainObject(schema['content'])) {
    for (const media of Object.values(schema['content'])) {
      collectProjectionEntries(
        media?.schema,
        path,
        entries,
        getSchema,
        visitedRefs
      );
    }
    return;
  }

  for (const composite of ['allOf', 'anyOf', 'oneOf']) {
    if (isArray(schema[composite])) {
      for (const branch of schema[composite]) {
        collectProjectionEntries(branch, path, entries, getSchema, visitedRefs);
      }
    }
  }

  if (isPlainObject(schema['items'])) {
    collectProjectionEntries(
      schema['items'],
      [...path, ARRAY_SEGMENT],
      entries,
      getSchema,
      visitedRefs
    );
  }

  if (isPlainObject(schema['properties'])) {
    for (const [key, property] of Object.entries(schema['properties'])) {
      collectProjectionEntries(
        property,
        [...path, key],
        entries,
        getSchema,
        visitedRefs
      );
    }
  }
}

/**
 * Records a projection entry when the schema name resolves to a resource output model. Returns whether the name
 * denotes a resource instance schema, regardless of an entry being recorded, since resource model schemas are
 * projected recursively and must not be walked any further.
 *
 * @param {string} name - The schema name (`$id` or `$ref`) to resolve to a resource output model.
 * @param {string[]} path - Payload path at which the schema was encountered.
 * @param {VirtualProjectionEntry[]} entries - Accumulator the entry is pushed into, unless an equal entry is already
 * present or the resource has no projectable fields.
 * @return {boolean} `true` when the name denotes a resource instance schema, `false` otherwise.
 */
function recordInstanceEntry(
  name: string,
  path: string[],
  entries: VirtualProjectionEntry[]
): boolean {
  const resourceName = resolveInstanceResourceName(name);
  if (!resourceName) {
    return false;
  }

  const exists = entries.some(
    (entry) =>
      entry.resourceName === resourceName &&
      entry.path.length === path.length &&
      entry.path.every((segment, index) => segment === path[index])
  );

  if (!exists && hasProjectableFields(resourceName, new Set())) {
    entries.push({ path, resourceName });
  }

  return true;
}

/**
 * Resolves a schema name to the name of the resource whose output model it represents, by stripping each of the
 * {@link INSTANCE_SUFFIXES} in turn and returning the first candidate that matches a registered model.
 *
 * @param {string} name - The schema name (`$id` or `$ref`) to resolve.
 * @return {string | undefined} The resource name, or `undefined` when the schema does not belong to a registered
 * resource model.
 */
function resolveInstanceResourceName(name: string): string | undefined {
  for (const suffix of INSTANCE_SUFFIXES) {
    if (suffix && !name.endsWith(suffix)) {
      continue;
    }

    const resourceName = suffix ? name.slice(0, -suffix.length) : name;
    if (resourceName && injectModel(resourceName, false)) {
      return resourceName;
    }
  }

  return undefined;
}

/**
 * Checks whether projecting a resource would set any values — the model defines virtual fields itself, or reaches a
 * model with virtual fields through its relations or files.
 *
 * @param {string} resourceName - Name of the resource model to check.
 * @param {Set<string>} visited - Resource names already checked along the current descent, guarding against circular
 * relations.
 * @return {boolean} `true` when the resource or any resource reachable through its relations or files defines virtual
 * fields, `false` otherwise.
 */
function hasProjectableFields(
  resourceName: string,
  visited: Set<string>
): boolean {
  const resourceModel = injectModel(resourceName, false);
  if (!resourceModel || visited.has(resourceName)) {
    return false;
  }

  visited.add(resourceName);

  if (Object.keys(resourceModel.config?.virtual ?? {}).length > 0) {
    return true;
  }

  for (const schema of [
    resourceModel.relationsModel,
    resourceModel.filesModel
  ]) {
    const properties = extractSchemaProperties(schema) ?? {};
    for (const key of Object.keys(properties)) {
      const nestedName = extractResourceName(
        extractSchemaProperties(schema, key)
      );
      if (nestedName && hasProjectableFields(nestedName, visited)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Walks a payload along a projection path and projects the resource virtual fields onto every object reached at its
 * end, mapping over array elements for each {@link ARRAY_SEGMENT} marker. Objects along the path are mutated in place,
 * while arrays are mapped into new ones.
 *
 * @param {any} value - The payload node currently being walked.
 * @param {string[]} path - Payload path segments leading to the values to project.
 * @param {number} index - Index of the path segment to apply at this level.
 * @param {string} resourceName - Name of the resource model whose virtual fields are projected.
 * @return {any} The payload node with virtual fields projected, or the node unchanged when the path does not resolve.
 */
function applyProjection(
  value: any,
  path: string[],
  index: number,
  resourceName: string
): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (index === path.length) {
    if (isArray(value)) {
      return value.map((item) =>
        isPlainObject(item) ? projectVirtualFields(item, resourceName) : item
      );
    }
    return isPlainObject(value)
      ? projectVirtualFields(value, resourceName)
      : value;
  }

  const segment = path[index];

  if (segment === ARRAY_SEGMENT) {
    return isArray(value)
      ? value.map((item) =>
          applyProjection(item, path, index + 1, resourceName)
        )
      : value;
  }

  if (!isPlainObject(value) || value[segment] === undefined) {
    return value;
  }

  value[segment] = applyProjection(
    value[segment],
    path,
    index + 1,
    resourceName
  );

  return value;
}
