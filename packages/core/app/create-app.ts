import path from 'node:path';
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import {
  camelToSnakeCase,
  config,
  loggerConfig,
  plural
} from '@appweaver/common';
import { context } from '../context';
import auth from '../security/auth';
import { errorHandler } from '../errors';
import { files } from '../storage';
import { loadResources } from '../resource';
import { info } from './info-route';
import swagger from './swagger';
import { Application } from './application';

export type CreateAppParams = {
  /** A boolean flag indicating whether the application should automatically
   * start after being created. (default: true) **/
  autoStart?: boolean;
  /** A boolean flag indicating whether the application should automatically load resources
   * configured and exported using factory functions. (default: true) */
  autoLoadResources?: boolean;
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
  // Create a Fastify server instance
  const server = Fastify({
    ajv: {
      customOptions: {
        removeAdditional: 'all'
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

  // Register CORS rules
  server.register(fastifyCors, {
    origin: config.CORS_ORIGIN,
    methods: config.CORS_METHODS,
    allowedHeaders: config.CORS_ALLOWED_HEADERS,
    exposedHeaders: config.CORS_EXPOSED_HEADERS,
    maxAge: config.CORS_MAX_AGE,
    credentials: config.CORS_CREDENTIALS
  });

  // Register security rules
  server.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        ...fastifyHelmet.contentSecurityPolicy.getDefaultDirectives(),
        'connect-src': ['*']
      }
    }
  });

  // Register static public file serving
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

  // Register multipart file upload plugin
  server.register(fastifyMultipart, { throwFileSizeLimit: false });

  // Register global request rate limiter
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

  // Autoload resource models, routes, policies and services
  if (params.autoLoadResources !== false) {
    await loadResources(
      path.dirname(require.main?.filename || process.argv[1])
    );
  }

  // Register swagger documentation and UI, must be called after loadResources
  if (config.SWAGGER_ENABLED) {
    server.register(swagger);
  }

  // Set global error handler for all routes
  server.setErrorHandler(errorHandler);

  // Register authentication plugin
  server.register(auth);

  // Register files route
  server.register(files, { prefix: config.SERVER_API_PREFIX });

  // Register info route
  server.register(info, { prefix: config.SERVER_API_PREFIX });

  // Register resource API routes
  for (const [name, route] of Object.entries(context.routes)) {
    const routesPath =
      route.config.path || camelToSnakeCase(plural(name), '-').toLowerCase();
    const prefix = [config.SERVER_API_PREFIX, routesPath]
      .join('/')
      .replaceAll('//', '/');
    server.register(route.handler, { prefix });
  }

  context.server = server;

  const app = new Application(server);

  if (params.autoStart !== false) {
    await app.start();
  }

  return app;
}
