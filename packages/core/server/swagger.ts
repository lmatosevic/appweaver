import fastifyPlugin from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import { config } from '@appweaver/common';
import { Server } from '../types';

export default fastifyPlugin((server: Server) => {
  server.register(fastifySwagger, {
    hideUntagged: config.SWAGGER_HIDE_UNTAGGED,
    transformObject: pruneUnusedSchemas,
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

  server.register(fastifySwaggerUI, {
    routePrefix: config.SWAGGER_PATH,
    indexPrefix: new URL(config.APP_HOSTNAME).pathname,
    staticCSP: false
  });
});

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
