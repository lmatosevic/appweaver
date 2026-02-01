import path from 'node:path';
import Fastify, { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart, { ajvFilePlugin } from '@fastify/multipart';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import { config, HttpError, loggerConfig, plural } from '@appweaver/common';
import { context } from '../context';
import auth from '../security/auth';
import { Application } from './application';

export type CreateAppParams = {
  start?: boolean;
};

/**
 * Creates and configures a new application instance.
 *
 * This function initializes a Fastify server with various plugins and configurations,
 * including CORS, security rules (e.g., Helmet), multipart file uploads, rate limiting,
 * static file serving, authentication, and Swagger documentation (if enabled).
 * It also sets a global error handler for all routes.
 *
 * @return {Promise<Application>} A promise that resolves with the configured application instance.
 */
export async function createApp(
  params: CreateAppParams = {}
): Promise<Application> {
  // Create a Fastify server instance.
  const server = Fastify({
    ajv: {
      customOptions: {
        removeAdditional: 'all'
      },
      onCreate: (ajv): void => {
        ajvFilePlugin(ajv);
      }
    },
    routerOptions: {
      maxParamLength: 512,
      caseSensitive: false
    },
    trustProxy: true,
    bodyLimit: config.SERVER_BODY_LIMIT_BYTES,
    logger: loggerConfig
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Register CORS rules.
  server.register(fastifyCors, {
    origin: config.CORS_ORIGIN,
    methods: config.CORS_METHODS,
    allowedHeaders: config.CORS_ALLOWED_HEADERS,
    exposedHeaders: config.CORS_EXPOSED_HEADERS,
    maxAge: config.CORS_MAX_AGE,
    credentials: config.CORS_CREDENTIALS
  });

  // Register security rules.
  server.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        ...fastifyHelmet.contentSecurityPolicy.getDefaultDirectives(),
        'connect-src': ['*']
      }
    }
  });

  // Register static public file serving.
  if (config.SERVER_STATIC_ENABLED) {
    server.register(fastifyStatic, {
      root: path.isAbsolute(config.SERVER_STATIC_DIR_PATH)
        ? config.SERVER_STATIC_DIR_PATH
        : path.join(process.cwd(), config.SERVER_STATIC_DIR_PATH),
      prefix: config.SERVER_STATIC_ROUTE_PREFIX,
      maxAge: config.SERVER_STATIC_MAX_AGE,
      prefixAvoidTrailingSlash: true,
      constraints: config.SERVER_STATIC_ALLOWED_HOST
        ? { host: config.SERVER_STATIC_ALLOWED_HOST }
        : {}
    });
  }

  // Register multipart file upload plugin.
  server.register(fastifyMultipart, { throwFileSizeLimit: false });

  // Register global request rate limiter.
  if (config.RATE_LIMIT_ENABLED) {
    server.register(fastifyRateLimit, {
      max: config.RATE_LIMIT_MAX,
      timeWindow: config.RATE_LIMIT_WINDOW,
      redis: null
      // config.RATE_LIMIT_STORE === 'redis'
      //   ? redis.createClient({
      //     connectTimeout: 500,
      //     maxRetriesPerRequest: 1,
      //     lazyConnect: true
      //   })
      //   : null
    });
  }

  // Register swagger documentation and UI.
  if (config.SWAGGER_ENABLED) {
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
  }

  // Set global error handler for all routes.
  server.setErrorHandler(
    (
      err: FastifyError | HttpError,
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const { message, statusCode, error, errorCode } = err as HttpError;

      if (!statusCode || statusCode >= 500) {
        if (!error) {
          request.log.error(err.stack);
        } else {
          request.log.error(error);
        }
      }

      const errorResponse = {
        errorCode: errorCode || statusCode || 500,
        message: message || 'Unknown error'
      };

      const contentType = reply.getHeader('Content-Type');

      reply
        .status(statusCode || 500)
        .send(
          contentType && contentType !== 'application/json'
            ? errorResponse.message
            : errorResponse
        );
    }
  );

  // Register authentication plugin.
  server.register(auth);

  // Register resource API routes.
  for (const [name, route] of Object.entries(context.routes)) {
    const parts = [config.SERVER_API_PREFIX, plural(name).toLowerCase()];
    server.register(route, { prefix: parts.join('/') });
  }

  context.server = server;

  const app = new Application(server);

  if (params.start) {
    await app.start();
    return app;
  }

  return new Application(server);
}
