import path from 'node:path';
import Fastify, { FastifyPluginCallback } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import { fastifyRequestContext } from '@fastify/request-context';
import {
  camelToSnakeCase,
  config,
  loggerConfig,
  MemoryType,
  plural,
  Redis
} from '@appweaver/common';
import { context, inject, injectAll } from '../context';
import { errorHandler } from '../errors';
import { files } from '../storage';
import { health } from '../health';
import auth from '../security/auth';
import caching from '../cache/caching';
import { RouterHandler, Server } from '../types';
import { PLUGIN, ROUTE } from '../constants';
import { info } from './info-route';
import schemas from './schemas';
import swagger from './swagger';

/**
 * Creates and configures a new server instance.
 *
 * This function initializes a Fastify server with various plugins and configurations,
 * including CORS, security rules (e.g., Helmet), multipart file uploads, rate limiting,
 * static file serving, authentication, and Swagger documentation (if enabled).
 * It also sets a global error handler for all routes.
 *
 * Additionally, this function:
 * - Loads and registers all user-defined plugins
 * - Registers schema models for route validation with $ref support
 * - Sets up a global error handler for all routes
 * - Registers built-in routes (health check, info, files)
 * - Loads and registers resource API routes generated from the resource context
 * - Loads and registers user-defined custom routes
 *
 * @return {Server} A configured Fastify server instance with TypeBox type provider.
 */
export function createServer(): Server {
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
    logger: loggerConfig,
    disableRequestLogging: !config.SERVER_REQUEST_LOGGING_ENABLED
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
      nameSpace: 'rate-limit:',
      redis:
        config.RATE_LIMIT_STORE === MemoryType.Redis
          ? inject<Redis>(Redis).createClient({
              connectTimeout: 500,
              maxRetriesPerRequest: 1,
              lazyConnect: true
            })
          : null
    });
  }

  // Register request context plugin with default values
  server.register(fastifyRequestContext, {
    defaultStoreValues: {
      authUser: null,
      cached: undefined
    }
  });

  // Register all defined plugins
  const plugins = injectAll<FastifyPluginCallback>(PLUGIN);
  for (const plugin of plugins) {
    server.register(plugin);
  }

  // Set global error handler for all routes
  server.setErrorHandler(errorHandler);

  // Register schema models to enable $ref usage in route validation
  server.register(schemas);

  // Register authentication plugin
  server.register(auth);

  // Register caching plugin
  if (config.CACHE_ENABLED) {
    server.register(caching);
  }

  // Register swagger documentation and UI. Must be called after loadResources
  if (config.SWAGGER_ENABLED) {
    server.register(swagger);
  }

  // Register a health route
  if (config.HEALTH_CHECK_ENABLED) {
    server.register(health, { prefix: config.HEALTH_CHECK_ROUTE_PREFIX });
  }

  // Register info route
  server.register(info, { prefix: config.SERVER_API_PREFIX });

  // Register files route
  server.register(files, { prefix: config.SERVER_API_PREFIX });

  // Register resource routes
  for (const route of context.resource.routes.values()) {
    const routesPath =
      route.config.path ||
      camelToSnakeCase(plural(route.config.modelName), '-').toLowerCase();
    const prefix = [config.SERVER_API_PREFIX, routesPath]
      .join('/')
      .replaceAll('//', '/');
    server.register(route.handler, { prefix });
  }

  // Register other defined routes
  const routes = injectAll<RouterHandler>(ROUTE);
  for (const route of routes) {
    server.register(route, { prefix: config.SERVER_API_PREFIX + '/' });
  }

  return server;
}
