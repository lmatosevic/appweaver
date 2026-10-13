import AjvCompiler, {
  BuildCompilerFromPool,
  ErrorObject
} from '@fastify/ajv-compiler';
import { FastifyServerOptions } from 'fastify';
import { config } from '@appweaver/common';
import { FastifyRouteSchemaDef } from 'fastify/types/schema';

type Schema = Record<string | symbol, any>;

type Validate = ((this: unknown, data: unknown, context?: unknown) => any) & {
  errors?: ErrorObject[] | null;
  $async?: boolean;
  [key: string]: unknown;
};

type RouteCompiler = (route: FastifyRouteSchemaDef<unknown>) => Validate;

// The keywords summarizing the failure of their subschemas
const SUMMARY_KEYWORDS = new Set(['anyOf', 'oneOf', 'if']);

// The more specific the keyword, the more it tells about the intended shape
const KEYWORD_RANK = ['additionalProperties', 'required'];

// The keywords holding a single subschema, a list of them, or a map of them
const SCHEMA_KEYWORDS = [
  'items',
  'additionalItems',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'propertyNames',
  'additionalProperties'
];
const LIST_KEYWORDS = ['anyOf', 'oneOf', 'allOf', 'prefixItems'];
const MAP_KEYWORDS = [
  'properties',
  'patternProperties',
  'dependentSchemas',
  'definitions',
  '$defs'
];

/**
 * Creates the request validation options of the server. A request body,
 * querystring or path parameters holding a property its schema does not
 * declare is rejected, rather than the property being silently dropped. With
 * a maximum error count above `1` the whole request part is validated, reporting up
 * to that many errors, otherwise the validation stops at the first one.
 *
 * @param {number} [maxErrorCount] The maximum number of errors a failed request
 * reports (default: `SERVER_ERROR_RESPONSE_MAX_COUNT`).
 * @return {Pick<FastifyServerOptions, 'schemaController' | 'ajv'>} The
 * validation options of a Fastify server.
 */
export function requestValidation(
  maxErrorCount: number = config.SERVER_ERROR_RESPONSE_MAX_COUNT
): Pick<FastifyServerOptions, 'schemaController' | 'ajv'> {
  const limit = Math.max(1, maxErrorCount);

  return {
    schemaController: {
      compilersFactory: { buildValidator: strictValidator(limit) }
    },
    ajv: {
      customOptions: {
        removeAdditional: false,
        // The size of a request is bounded by the body limit, which bounds
        // the work of collecting every error too
        allErrors: limit > 1,
        // Attaches the schema and the data to the errors, to pick the most
        // relevant one, see relevantErrors
        verbose: true,
        // Query filter schemas declare plain values as a list of accepted
        // primitive types, so the validator does not coerce them
        allowUnionTypes: true
      },
      plugins: [(ajv): any => ajv.addKeyword('example').addKeyword('x-consume')]
    }
  };
}

/**
 * Creates a validator factory closing every request schema before compiling
 * it (see {@link closeSchema}), and reducing the errors of a failed validation
 * to the relevant ones (see {@link relevantErrors}). The headers are left
 * open, since a client always sends headers a route does not declare.
 *
 * @param {number} [limit=1] The maximum number of errors a failed validation
 * reports.
 * @return {BuildCompilerFromPool} The validator factory for the
 * `schemaController.compilersFactory.buildValidator` server option.
 */
export function strictValidator(limit: number = 1): BuildCompilerFromPool {
  const buildCompiler = AjvCompiler();

  return ((
    externalSchemas: Parameters<BuildCompilerFromPool>[0],
    options: Parameters<BuildCompilerFromPool>[1]
  ) => {
    const closed: Parameters<BuildCompilerFromPool>[0] = Object.fromEntries(
      Object.entries(externalSchemas ?? {}).map(([id, schema]) => [
        id,
        closeSchema(schema)
      ])
    );
    // The package types declare the signature of an Ajv compile, while Fastify
    // calls the compiler with the route schema definition
    const compile = buildCompiler(closed, options) as unknown as RouteCompiler;

    return (route: FastifyRouteSchemaDef<unknown>) =>
      withRelevantErrors(
        compile(
          route.httpPart === 'headers'
            ? route
            : { ...route, schema: closeSchema(route.schema) }
        ),
        limit
      );
  }) as unknown as BuildCompilerFromPool;
}

/**
 * Reduces the errors of a failed validation to the relevant ones. A value
 * failing a union (`anyOf`, `oneOf`) reports an error per member it was tried
 * against, most of them about members the value was never meant to match, so
 * every failed union is reduced to the errors of its most relevant member,
 * found by its most relevant error, picked by, in order:
 *
 * 1. the deepest position in the data, as a member reaching further into the
 *    value matched more of it;
 * 2. the largest share of the required properties of the member present in
 *    the object, telling the intended object shape apart (an inline update
 *    requiring an id, an inline create requiring its own fields), while a type
 *    mismatch ranks last;
 * 3. the most properties of the object the member declares;
 * 4. the most specific keyword: an undeclared property, then a missing one;
 * 5. the order of the members in the union.
 *
 * The other errors of that member on the same object are kept, i.e. both a
 * missing and an undeclared property. When the most relevant error is a type
 * mismatch, the mismatches at the same position are merged into one error
 * listing every accepted type. The errors outside of a union are kept, so a
 * validation collecting all errors reports one per independent failure. The
 * schema and the data attached by the `verbose` option are removed.
 *
 * @param {ErrorObject[]} errors The errors of the failed validation, in the
 * order the validator reported them.
 * @param {number} [limit=1] The maximum number of errors to return.
 * @return {ErrorObject[]} The relevant errors, at most `limit` of them.
 */
export function relevantErrors(
  errors: ErrorObject[],
  limit: number = 1
): ErrorObject[] {
  const reduced: ErrorObject[] = [];

  for (const error of errors) {
    if (!SUMMARY_KEYWORDS.has(error.keyword)) {
      reduced.push(error);
      continue;
    }

    // The errors of the union members precede its summary error and lie at or
    // below its position, a nested union being already reduced to one
    let start = reduced.length;
    while (start > 0 && isWithin(reduced[start - 1], error.instancePath)) {
      start--;
    }
    const members = reduced.splice(start);
    reduced.push(...(members.length > 0 ? mostRelevant(members) : [error]));
  }

  return reduced.slice(0, limit).map(withoutVerbose);
}

function withRelevantErrors(validate: Validate, limit: number): Validate {
  // An asynchronous validation reports its errors through the rejection
  if (validate.$async) {
    return validate;
  }

  const wrapped: Validate = Object.assign(function (
    this: unknown,
    data: unknown,
    context?: unknown
  ) {
    const valid = validate.call(this, data, context);
    wrapped.errors =
      valid || !validate.errors ? null : relevantErrors(validate.errors, limit);
    return valid;
  }, validate);

  return wrapped;
}

// The errors of the most relevant union member, which are the ones reported for
// the same object against the same schema as the most relevant error
function mostRelevant(errors: ErrorObject[]): ErrorObject[] {
  let best = errors[0];
  for (const error of errors.slice(1)) {
    if (compareErrors(error, best) < 0) {
      best = error;
    }
  }

  if (best.keyword === 'type') {
    const types = errors
      .filter(
        (e) => e.keyword === 'type' && e.instancePath === best.instancePath
      )
      .flatMap((e) => String(e.params.type).split(','));
    const type = [...new Set(types)];
    // The merged types are kept in the params, so a union holding this one
    // merges them again
    return [
      {
        ...best,
        params: { type: type.join(',') },
        message: `must be ${listTypes(type)}`
      }
    ];
  }

  return errors.filter(
    (e) =>
      e === best ||
      (best.parentSchema !== undefined &&
        e.parentSchema === best.parentSchema &&
        e.instancePath === best.instancePath)
  );
}

function isWithin(error: ErrorObject, path: string): boolean {
  return (
    error.instancePath === path || error.instancePath.startsWith(`${path}/`)
  );
}

// Orders the more relevant of two errors first, see relevantErrors
function compareErrors(a: ErrorObject, b: ErrorObject): number {
  return (
    depth(b) - depth(a) ||
    requiredCoverage(b) - requiredCoverage(a) ||
    matchedProperties(b) - matchedProperties(a) ||
    keywordRank(a) - keywordRank(b)
  );
}

function depth(error: ErrorObject): number {
  return error.instancePath.split('/').filter(Boolean).length;
}

function requiredCoverage(error: ErrorObject): number {
  if (error.keyword === 'type') {
    return -1;
  }

  const required: string[] = error.parentSchema?.required ?? [];
  const data = error.data;
  if (required.length === 0 || !isObject(data)) {
    return 1;
  }
  const present = required.filter((name) => name in data);
  return present.length / required.length;
}

function matchedProperties(error: ErrorObject): number {
  if (error.keyword === 'type') {
    return -1;
  }

  const properties = error.parentSchema?.properties;
  if (!properties || !isObject(error.data)) {
    return 0;
  }
  return Object.keys(error.data).filter((name) => name in properties).length;
}

function isObject(data: unknown): data is Record<string, unknown> {
  return !!data && typeof data === 'object' && !Array.isArray(data);
}

function keywordRank(error: ErrorObject): number {
  const rank = KEYWORD_RANK.indexOf(error.keyword);
  return rank === -1 ? KEYWORD_RANK.length : rank;
}

function listTypes(types: string[]): string {
  return types.length > 1
    ? `${types.slice(0, -1).join(', ')} or ${types[types.length - 1]}`
    : types[0];
}

function withoutVerbose(error: ErrorObject): ErrorObject {
  const {
    schema: _schema,
    parentSchema: _parent,
    data: _data,
    ...rest
  } = error;
  return rest;
}

/**
 * Copies a JSON schema, adding `additionalProperties: false` to every object
 * schema declaring its `properties` without the keyword, so setting it
 * explicitly (i.e. `additionalProperties: true`) keeps an object open. The
 * members of an `allOf` combining several schemas are left open, as each one
 * would reject the properties of the others.
 *
 * @param {T} schema The schema to close.
 * @return {T} The closed copy of the schema, the original is left unchanged.
 */
export function closeSchema<T>(schema: T): T {
  return close(schema, false, new WeakMap()) as T;
}

function close(schema: any, open: boolean, seen: WeakMap<object, any>): any {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema;
  }
  // Only the closed copies are reused, an open one is made per allOf member
  if (!open && seen.has(schema)) {
    return seen.get(schema);
  }

  const copy: Schema = { ...schema };
  if (!open) {
    seen.set(schema, copy);
  }

  for (const keyword of SCHEMA_KEYWORDS) {
    if (keyword in copy) {
      copy[keyword] = close(copy[keyword], false, seen);
    }
  }
  for (const keyword of LIST_KEYWORDS) {
    if (Array.isArray(copy[keyword])) {
      const combined = keyword === 'allOf' && copy[keyword].length > 1;
      copy[keyword] = copy[keyword].map((s: unknown) =>
        close(s, combined, seen)
      );
    }
  }
  for (const keyword of MAP_KEYWORDS) {
    if (copy[keyword] && typeof copy[keyword] === 'object') {
      copy[keyword] = Object.fromEntries(
        Object.entries(copy[keyword]).map(([name, s]) => [
          name,
          close(s, false, seen)
        ])
      );
    }
  }

  if (
    !open &&
    copy.properties &&
    typeof copy.properties === 'object' &&
    !('additionalProperties' in copy) &&
    !('patternProperties' in copy) &&
    !('unevaluatedProperties' in copy)
  ) {
    copy.additionalProperties = false;
  }

  return copy;
}
