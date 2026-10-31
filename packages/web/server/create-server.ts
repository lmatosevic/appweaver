import path from 'node:path';
import { AsyncResource } from 'node:async_hooks';
import Fastify, { FastifyBaseLogger, LogController } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { fastifyRequestContext } from '@fastify/request-context';
import {
  createLogger,
  Database,
  PLUGIN,
  ROUTE,
  textToBytes
} from '@appweaver/common';
import {
  storageConfig,
  cacheConfig,
  injectAll,
  injectModel,
  isDefined,
  runInAuthContext
} from '@appweaver/core';
import { templatePreviewConfig } from '../template/template-preview-config';
import { healthCheckConfig } from '../health/health-check-config';
import { corsConfig, rateLimitConfig, serverConfig } from './server-config';
import { context } from '@appweaver/core/internal';
import { errorHandler, notFoundHandler } from '../errors';
import { stashErrorResponses } from '../errors';
import { files } from '../storage/file-route';
import { health } from '../health/health-routes';
import { templatePreview } from '../template/template-preview-route';
import auth from '../security/auth';
import caching from '../cache/caching';
import { Router, Server } from '../types/server';
import { info } from './info-route';
import { PluginEntry } from './register-plugin';
import { registerRateLimit } from './rate-limit';
import { requestValidation } from './request-validation';
import { referencedSerializer } from './response-serialization';
import schemas from './schemas';
import swagger from './swagger';

/**
 * Creates and configures a new server instance.
 *
 * This function initializes a Fastify server with various plugins and configurations,
 * including CORS, security rules (e.g., Helmet), multipart file uploads, rate limiting,
 * static file serving, authentication, and Swagger documentation (if enabled).
 * It also sets the global error and not found handlers, responding with RFC 9457
 * problem details.
 *
 * Additionally, this function:
 * - Loads and registers all user-defined plugins
 * - Registers schema models for route validation with $ref support
 * - Sets up the global error and not found handlers for all routes
 * - Registers built-in routes (health check, template preview, info, files)
 * - Loads and registers resource API routes generated from the resource context
 * - Loads and registers user-defined custom routes
 *
 * @return {Server} A configured Fastify server instance with TypeBox type provider.
 */
export function createServer(): Server {
  // Create a Fastify server instance
  const validation = requestValidation();
  // Typed as the base logger of the Server type, not as a pino logger
  const loggerInstance: FastifyBaseLogger = createLogger('server');
  const server = Fastify({
    ...validation,
    schemaController: {
      compilersFactory: {
        ...validation.schemaController?.compilersFactory,
        buildSerializer: referencedSerializer()
      }
    },
    routerOptions: {
      maxParamLength: 512,
      caseSensitive: false
    },
    trustProxy: serverConfig.TRUST_PROXY,
    bodyLimit: textToBytes(serverConfig.BODY_MAX_SIZE),
    logController: new LogController({
      disableRequestLogging: !serverConfig.REQUEST_LOGGING_ENABLED
    }),
    loggerInstance
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Register CORS rules
  server.register(fastifyCors, {
    // @fastify/cors matches a '*' inside a list literally, so it goes alone
    origin: corsConfig.ORIGIN.includes('*') ? '*' : corsConfig.ORIGIN,
    methods: corsConfig.METHODS,
    allowedHeaders: corsConfig.ALLOWED_HEADERS,
    exposedHeaders: corsConfig.EXPOSED_HEADERS,
    maxAge: corsConfig.MAX_AGE,
    credentials: corsConfig.CREDENTIALS
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
  if (serverConfig.STATIC_ENABLED) {
    server.register(fastifyStatic, {
      root: path.isAbsolute(serverConfig.STATIC_DIR_PATH)
        ? serverConfig.STATIC_DIR_PATH
        : path.join(process.cwd(), serverConfig.STATIC_DIR_PATH),
      prefix: serverConfig.STATIC_ROUTE_PREFIX,
      maxAge: serverConfig.STATIC_MAX_AGE,
      prefixAvoidTrailingSlash: true,
      constraints: serverConfig.STATIC_ALLOWED_HOST
        ? { host: serverConfig.STATIC_ALLOWED_HOST }
        : {},
      setHeaders: (reply) => {
        for (const header of serverConfig.STATIC_RESPONSE_HEADERS) {
          const [name, ...valueParts] = header.split(':');
          reply.header(name.trim(), valueParts.join(':').trim());
        }
      }
    });
  }

  // Register multipart file upload plugin
  server.register(fastifyMultipart, { throwFileSizeLimit: false });

  // Register global request rate limiter
  if (rateLimitConfig.ENABLED) {
    registerRateLimit(server);
  }

  // Register request context plugin with default values
  // The async resource of each request is created in a new auth context, so
  // the authenticated user is kept through the whole request
  server.register(fastifyRequestContext, {
    defaultStoreValues: { cached: undefined },
    createAsyncResource: () =>
      runInAuthContext(() => new AsyncResource('appweaver-request'))
  });

  // Register all defined plugins
  for (const { plugin } of injectAll<PluginEntry>(PLUGIN)) {
    server.register(plugin);
  }

  // Set global error and not found handlers for all routes
  server.setErrorHandler(errorHandler);
  server.setNotFoundHandler(notFoundHandler);

  // Keep the error responses out of the compiled serializers of every route
  server.addHook('onRoute', stashErrorResponses);

  // Register swagger documentation and UI. Must be registered after
  // loadResources and before any route registration
  server.register(swagger);

  // Register schema models to enable $ref usage in route validation
  server.register(schemas);

  // Register authentication plugin, authenticating the users of the database
  if (isDefined(Database)) {
    server.register(auth);
  }

  // Register caching plugin
  if (cacheConfig.ENABLED) {
    server.register(caching);
  }

  // Register a health route
  if (healthCheckConfig.ENABLED) {
    server.register(health, { prefix: healthCheckConfig.ROUTE_PREFIX });
  }

  // Register a template preview route
  if (templatePreviewConfig.ENABLED) {
    server.register(templatePreview, {
      prefix: templatePreviewConfig.ROUTE_PREFIX
    });
  }

  // Register files route, serving the files of the database records
  if (isDefined(Database) && injectModel('File', false)) {
    server.register(files, { prefix: storageConfig.FILES_ROUTE_PREFIX });
  }

  // Register info route
  server.register(info, { prefix: serverConfig.API_PREFIX });

  // Register resource routes
  for (const route of context.resource.routes.values()) {
    const prefix = [serverConfig.API_PREFIX, route.basePath]
      .join('/')
      .replaceAll('//', '/');
    server.register(route.handler, { prefix });
  }

  // Register other defined routes
  const routes = injectAll<(router: Router) => void>(ROUTE);
  for (const route of routes) {
    server.register(route, { prefix: serverConfig.API_PREFIX + '/' });
  }

  return server;
}
