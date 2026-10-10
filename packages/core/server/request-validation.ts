import AjvCompiler, { BuildCompilerFromPool } from '@fastify/ajv-compiler';
import { FastifyServerOptions } from 'fastify';
import { FastifyRouteSchemaDef } from 'fastify/types/schema';

type Schema = Record<string | symbol, any>;

type RouteCompiler = (route: FastifyRouteSchemaDef<unknown>) => unknown;

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
 * declare is rejected, rather than the property being silently dropped.
 *
 * @returns {Pick<FastifyServerOptions, 'schemaController' | 'ajv'>} The
 * validation options of a Fastify server.
 */
export function requestValidation(): Pick<
  FastifyServerOptions,
  'schemaController' | 'ajv'
> {
  return {
    schemaController: {
      compilersFactory: { buildValidator: strictValidator() }
    },
    ajv: {
      customOptions: {
        removeAdditional: false,
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
 * it (see {@link closeSchema}). The headers are left open, since a client
 * always sends headers a route does not declare.
 *
 * @returns {BuildCompilerFromPool} The validator factory for the
 * `schemaController.compilersFactory.buildValidator` server option.
 */
export function strictValidator(): BuildCompilerFromPool {
  const buildCompiler = AjvCompiler();

  return ((externalSchemas, options) => {
    const closed = Object.fromEntries(
      Object.entries(externalSchemas ?? {}).map(([id, schema]) => [
        id,
        closeSchema(schema)
      ])
    );
    // The package types declare the signature of an Ajv compile, while Fastify
    // calls the compiler with the route schema definition
    const compile = buildCompiler(closed, options) as unknown as RouteCompiler;

    return (route: FastifyRouteSchemaDef<unknown>) =>
      compile(
        route.httpPart === 'headers'
          ? route
          : { ...route, schema: closeSchema(route.schema) }
      );
  }) as BuildCompilerFromPool;
}

/**
 * Copies a JSON schema, adding `additionalProperties: false` to every object
 * schema declaring its `properties` without the keyword, so setting it
 * explicitly (i.e. `additionalProperties: true`) keeps an object open. The
 * members of an `allOf` combining several schemas are left open, as each one
 * would reject the properties of the others.
 *
 * @param {T} schema The schema to close.
 * @returns {T} The closed copy of the schema, the original is left unchanged.
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
