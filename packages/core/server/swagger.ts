import fastifyPlugin from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import { TObject } from '@sinclair/typebox';
import { config, objectHasProperty } from '@appweaver/common';
import { context, injectRoutes } from '../context';
import { resourceModelProps } from '../utils';
import { Server } from '../types';

export default fastifyPlugin((server: Server): void => {
  registerModelSchema(server);

  server.register(fastifySwagger, {
    hideUntagged: true,
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
          }
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

function registerModelSchema(server: Server): void {
  const usedSchemas = new Set<TObject>();

  for (const [name, model] of Object.entries(context.models)) {
    const routeSchema = injectRoutes(name, false)?.schema;

    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      const modelName = `${name}${suffix}`;
      const modelSchema = model[property].$defs[modelName];

      // Add schema if it's referenced in the route schema
      if (routeSchema && objectHasProperty(routeSchema, '$ref', modelName)) {
        usedSchemas.add(modelSchema);
        continue;
      }

      // Add schema if it's referenced by any other model variant
      for (const def of Object.values(model[property].$defs)) {
        if (objectHasProperty((def as TObject).properties, '$ref', modelName)) {
          usedSchemas.add(modelSchema);
          break;
        }
      }
    }
  }

  // Add used schemas to the server instance
  for (const schema of usedSchemas.values()) {
    if (schema.$id && !server.getSchema(schema.$id)) {
      server.addSchema({ ...schema });
    }
  }
}
