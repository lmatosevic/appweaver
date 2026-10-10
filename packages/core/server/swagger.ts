import { createHash } from 'node:crypto';
import { STATUS_CODES } from 'node:http';
import fastifyPlugin from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import { config, CONFIG_NAME, isArray } from '@appweaver/common';
import { context } from '../context';
import {
  documentErrorResponses,
  ERROR_RESPONSES_KEY,
  errorCodeName,
  PROBLEM_CONTENT_TYPE,
  PROBLEM_DETAILS_SCHEMA_NAME
} from '../errors';
import { Server } from '../types';

/** Names the request model of a route taking its request as query parameters. */
export const REQUEST_EXTENSION = `x-${CONFIG_NAME}-request`;

export default fastifyPlugin((server: Server) => {
  server.register(fastifySwagger, {
    hideUntagged: config.SWAGGER_HIDE_UNTAGGED,
    transform: ({ schema, url }) => ({
      schema: documentRouteErrors(schema),
      url
    }),
    transformObject: (document) =>
      addConfig(
        nameErrorCodes(
          hoistErrorResponses(
            normalizeUnionTypes(
              pruneUnusedSchemas(inlineNullableRefs(document))
            )
          )
        )
      ),
    openapi: {
      info: {
        title: config.APP_NAME,
        description: config.APP_DESCRIPTION,
        version: config.APP_VERSION
      },
      externalDocs: {
        url: 'https://swagger.io',
        description: 'Find more info here'
      },
      servers: [
        {
          url: config.APP_HOSTNAME
        }
      ],
      tags: [],
      components: {
        securitySchemes: {
          bearer: {
            scheme: 'bearer',
            bearerFormat: 'token',
            type: 'http'
          },
          ...(config.SECURITY_API_KEY_ENABLED
            ? {
                apiKeyAuth: {
                  type: 'apiKey',
                  in: 'header',
                  name: config.SECURITY_API_KEY_HEADER_NAME
                }
              }
            : {}),
          ...(config.SECURITY_BASIC_ENABLED
            ? {
                basicAuth: {
                  type: 'http',
                  scheme: 'basic'
                }
              }
            : {})
        }
      }
    }
  });

  if (config.SWAGGER_ENABLED) {
    server.register(fastifySwaggerUI, {
      routePrefix: config.SWAGGER_PATH,
      indexPrefix: new URL(config.APP_HOSTNAME).pathname,
      staticCSP: false
    });
  }
});

/**
 * Replaces every reference to a nullable model variant with the union it stands
 * for. Each model registers a `<Model>SingleNullable` schema the response
 * serializer needs as a name of its own, since it cannot compile an inline
 * union that cycles back to a model it is already writing. The document says
 * the same thing without that indirection, leaving the variants unreferenced
 * for {@link pruneUnusedSchemas} to drop.
 *
 * @param {Object} document The transform argument of the Swagger plugin,
 * wrapping the OpenAPI document in its `openapiObject` property.
 * @returns {Object} The same argument, with every reference to a nullable model
 * variant replaced in place.
 */
function inlineNullableRefs(document: any): any {
  const schemas = document.openapiObject?.components?.schemas ?? {};

  // The schemas are registered under generated names, so the variants are
  // recognized by the title carrying the name they were declared with
  const variants = new Map<string, any>();
  for (const [name, schema] of Object.entries<any>(schemas)) {
    if (/SingleNullable$/.test(schema?.title ?? '') && isArray(schema?.anyOf)) {
      variants.set(`#/components/schemas/${name}`, schema.anyOf);
    }
  }

  if (variants.size === 0) {
    return document;
  }

  const visit = (node: any): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    for (const value of Object.values(node)) {
      visit(value);
    }

    const union = variants.get(node.$ref);
    if (union) {
      delete node.$ref;
      node.anyOf = structuredClone(union);
    }
  };

  visit(document.openapiObject?.paths);
  visit(schemas);

  return document;
}

/**
 * Rewrites the JSON Schema type lists of the document into the equivalent
 * `anyOf` unions. The query filter schemas declare their plain values as a
 * type list, so the request validator leaves the matching values untouched
 * instead of coercing them into the first branch of a typed union, but a type
 * list is only valid from OpenAPI 3.1 onwards, while the emitted document is
 * an OpenAPI 3.0 one.
 *
 * @param {Object} document The OpenAPI document to rewrite in place.
 * @returns {Object} The same document with every type list replaced by an
 * `anyOf` union of the single-type schemas it listed.
 */
function normalizeUnionTypes(document: any): any {
  const visit = (node: any): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    for (const value of Object.values(node)) {
      visit(value);
    }

    if (Array.isArray(node.type)) {
      const branches = node.type.map((type: string) => ({ type }));
      delete node.type;
      // A node carrying both keywords keeps its own union as one branch, so
      // the two constraints still have to be satisfied together
      node.anyOf = node.anyOf ? [{ anyOf: node.anyOf }, ...branches] : branches;
    }
  };

  visit(document.paths);
  visit(document.components?.schemas);

  return document;
}

/**
 * Documents the error responses of a route by their status, in the schema the
 * document is generated from only, see `documentErrorResponses`.
 *
 * @param {Object} schema The schema of a route.
 * @returns {Object} The schema with its error responses narrowed.
 */
function documentRouteErrors(schema: any): any {
  if (!schema) {
    return schema;
  }
  const { [ERROR_RESPONSES_KEY]: errors, ...rest } = schema;
  const responses = { ...schema.response, ...errors };
  return Object.keys(responses).length > 0
    ? { ...rest, response: documentErrorResponses(responses) }
    : rest;
}

/**
 * Names the members of the error code enum of the problem details schema in
 * the `x-enum-varnames` extension, i.e. `ResourceNotFound` for
 * `RESOURCE_NOT_FOUND`, so a generated client declares them under the same
 * names as the `ErrorCode` enum and `defineErrors` do.
 *
 * @param {Object} document The OpenAPI document to extend in place.
 * @returns {Object} The same document.
 */
export function nameErrorCodes(document: any): any {
  const problem = Object.values<any>(document.components?.schemas ?? {}).find(
    (schema) => schema?.title === PROBLEM_DETAILS_SCHEMA_NAME
  );
  const code = problem?.properties?.code;
  if (Array.isArray(code?.enum)) {
    code['x-enum-varnames'] = code.enum.map(
      (value: string) => errorCodeName(value) ?? value
    );
  }
  return document;
}

/**
 * Moves the error responses the operations repeat into `components.responses`,
 * every operation referring to the shared one of its status and error codes.
 * A response of a single code is named after it, i.e. `ResourceNotFoundError`,
 * and one of several after its status and a hash of its codes, i.e.
 * `BadRequestError_1a2b3c`, so a name depends on its own codes only.
 *
 * @param {Object} document The OpenAPI document to rewrite in place.
 * @returns {Object} The same document, its error responses shared.
 */
export function hoistErrorResponses(document: any): any {
  const shared = new Map<
    string,
    { status: string; codes: string[]; response: unknown }
  >();
  const uses: { responses: any; status: string; key: string }[] = [];

  for (const pathItem of Object.values<any>(document.paths ?? {})) {
    for (const operation of Object.values<any>(pathItem ?? {})) {
      for (const [status, response] of Object.entries<any>(
        operation?.responses ?? {}
      )) {
        const codes: unknown =
          response?.content?.[PROBLEM_CONTENT_TYPE]?.schema?.allOf?.[1]
            ?.properties?.code?.enum;
        if (!Array.isArray(codes)) {
          continue;
        }

        const key = `${status}:${codes.join(',')}`;
        if (!shared.has(key)) {
          shared.set(key, { status, codes, response });
        }
        uses.push({ responses: operation.responses, status, key });
      }
    }
  }

  const names = new Map<string, string>();
  for (const [key, { status, codes, response }] of shared) {
    const name = errorResponseName(status, codes);
    names.set(key, name);

    document.components ??= {};
    document.components.responses ??= {};
    document.components.responses[name] = response;
  }

  for (const { responses, status, key } of uses) {
    responses[status] = { $ref: `#/components/responses/${names.get(key)}` };
  }
  return document;
}

/** Returns the name of a shared error response, see `hoistErrorResponses`. */
function errorResponseName(status: string, codes: string[]): string {
  const pascal = (text: string) =>
    text
      .split(/[^A-Za-z0-9]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  const withSuffix = (name: string) => `${name.replace(/Error$/, '')}Error`;

  if (codes.length === 1) {
    return withSuffix(
      errorCodeName(codes[0]) ?? pascal(codes[0].toLowerCase())
    );
  }
  const hash = createHash('sha1').update(codes.join(',')).digest('hex');
  return `${withSuffix(pascal(STATUS_CODES[status] ?? status))}_${hash.slice(0, 6)}`;
}

/**
 * Adds the `x-{CONFIG_NAME}-config` extension to the document, describing where
 * the routes of the application are mounted. The generated client reads it to
 * classify the paths of the specification into their route groups, which the
 * paths alone do not reveal once the prefixes are configurable. It holds the
 * base path of every resource route keyed by its model name, together with the
 * configured prefixes of the api, static, health, auth, account, and file
 * routes. Every path is normalized to start with a slash and to end without
 * one.
 *
 * @param {Object} document The OpenAPI document to extend in place.
 * @returns {Object} The same document, carrying the configuration extension.
 */
function addConfig(document: any): any {
  const normalizePath = (path: string): string => {
    const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
    return withLeadingSlash.endsWith('/') && withLeadingSlash.length > 1
      ? withLeadingSlash.slice(0, -1)
      : withLeadingSlash;
  };

  document[`x-${CONFIG_NAME}-config`] = {
    resourcePaths: [...context.resource.routes.values()].map((r) => ({
      name: r.config.modelName,
      basePath: normalizePath(r.basePath)
    })),
    routePrefixes: {
      api: normalizePath(config.SERVER_API_PREFIX),
      static: normalizePath(config.SERVER_STATIC_ROUTE_PREFIX),
      health: normalizePath(config.HEALTH_CHECK_ROUTE_PREFIX),
      auth: normalizePath(config.SECURITY_ROUTE_PREFIX),
      account: normalizePath(config.SECURITY_ACCOUNT_ROUTE_PREFIX),
      files: normalizePath(config.STORAGE_FILES_ROUTE_PREFIX)
    }
  };
  return document;
}

/**
 * Removes the schemas no route refers to from the document and sorts the ones
 * that remain by name. Every model registered on the server is added to the
 * schema registry, including the variants no route uses, so the document is
 * pruned down to the schemas actually reachable from a path. The reachable set
 * is collected by walking the paths for `#/components/schemas/` references and
 * following each one into the schema it points at, so the schemas referenced
 * only by another schema (i.e. a nested relation model, or a query filter
 * referring to itself) are kept as well, and so is the request model an
 * operation names in its `x-appweaver-request` extension.
 *
 * @param {Object} document The transform argument of the Swagger plugin,
 * wrapping the OpenAPI document in its `openapiObject` property.
 * @returns {Object} The unwrapped OpenAPI document, with the unreferenced
 * schemas removed and the remaining ones ordered by their title, falling back
 * to the name they are registered under.
 */
export function pruneUnusedSchemas(document: any): any {
  const schemas = document.openapiObject.components?.schemas ?? {};
  const used = new Set<string>();

  // Registered under generated names, so found by their title
  const requestRefs = Object.values<any>(document.openapiObject.paths ?? {})
    .flatMap((item) => Object.values<any>(item ?? {}))
    .map((operation) => operation?.[REQUEST_EXTENSION])
    .filter((title): title is string => typeof title === 'string')
    .map((title) =>
      Object.keys(schemas).find(
        (name) => (schemas[name]?.title ?? name) === title
      )
    )
    .filter((name) => name !== undefined)
    .map((name) => ({ $ref: `#/components/schemas/${name}` }));

  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;

    if (typeof node.$ref === 'string') {
      const match = node.$ref.match(/^#\/components\/schemas\/(.+)$/);
      if (match) {
        const schemaName = match[1];
        if (!used.has(schemaName)) {
          used.add(schemaName);
          visit(schemas[schemaName]);
        }
      }
    }

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    for (const value of Object.values(node)) {
      visit(value);
    }
  };

  visit(document.openapiObject.paths);
  visit(requestRefs);

  if (document.openapiObject.components?.schemas) {
    document.openapiObject.components.schemas = Object.fromEntries(
      Object.entries<any>(document.openapiObject.components.schemas)
        .sort(([nameA, objA], [nameB, objB]) =>
          String(objA.title ?? nameA).localeCompare(String(objB.title ?? nameB))
        )
        .filter(([name]) => used.has(name))
    );
  }

  return document.openapiObject;
}
