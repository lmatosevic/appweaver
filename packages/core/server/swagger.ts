import fastifyPlugin from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import { config } from '@appweaver/common';
import { Server } from '../types';

export default fastifyPlugin((server: Server): void => {
  server.register(fastifySwagger, {
    hideUntagged: config.SWAGGER_HIDE_UNTAGGED,
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
