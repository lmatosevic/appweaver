import fastifyPlugin from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import { config, CONFIG_NAME } from '@appweaver/common';
import { context } from '../context';
import { Server } from '../types';

export default fastifyPlugin((server: Server) => {
  server.register(fastifySwagger, {
    hideUntagged: config.SWAGGER_HIDE_UNTAGGED,
    transformObject: (document) =>
      addConfig(normalizeUnionTypes(pruneUnusedSchemas(document))),
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
 * referring to itself) are kept as well.
 *
 * @param {Object} document The transform argument of the Swagger plugin,
 * wrapping the OpenAPI document in its `openapiObject` property.
 * @returns {Object} The unwrapped OpenAPI document, with the unreferenced
 * schemas removed and the remaining ones ordered by their title, falling back
 * to the name they are registered under.
 */
function pruneUnusedSchemas(document: any): any {
  const schemas = document.openapiObject.components?.schemas ?? {};
  const used = new Set<string>();

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
