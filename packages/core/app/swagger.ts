import fastifyPlugin from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import { config, resourceModelProps } from '@appweaver/common';
import { context } from '../context';
import { ServerInstance } from '../types';

export default fastifyPlugin((server: ServerInstance): void => {
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

function registerModelSchema(server: ServerInstance): void {
  for (const [name, model] of Object.entries(context.models)) {
    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      const modelSchema = model[property].$defs[`${name}${suffix}`];
      server.addSchema({ ...modelSchema });
    }
  }
}
