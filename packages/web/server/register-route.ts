import Fastify, { RouteOptions } from 'fastify';
import { TObject, Type } from '@sinclair/typebox';
import {
  AuthType,
  isArray,
  createLogger,
  ROUTE,
  RouteCacheConfig,
  RouteConfig
} from '@appweaver/common';
import { define } from '@appweaver/core';
import {
  authErrorCodes,
  authSchema,
  captchaErrorCodes,
  captchaHeaderSchema
} from '../security/auth-schema';
import { errorResponses, mergeErrorResponses } from '../errors';
import { Router, Server } from '../types/server';
import {
  buildVirtualProjectionPlan,
  createVirtualProjectionHook
} from './virtual-projection';

const logger = createLogger('server');

/**
 * Registers custom routes of the application. The routes declared by the handler are captured on a temporary server
 * and copied to the application server once it starts, with the authentication, bot checks, error responses, and
 * cache of the given config applied to each one.
 *
 * @param {Function} handler - Declares the routes on the given router.
 * @param {RouteConfig & RouteCacheConfig} [config] - The authentication, bot check, and cache config of the routes.
 */
export function registerRoute(
  handler: (router: Router) => void,
  config?: RouteConfig & RouteCacheConfig
): void {
  const routes: RouteOptions[] = [];
  const tempServer = Fastify({
    logger: false,
    // The server the routes are copied to adds the HEAD route of a GET route
    // itself, a captured one would be declared twice
    exposeHeadRoutes: false,
    ajv: {
      customOptions: { allowUnionTypes: true },
      plugins: [(ajv): any => ajv.addKeyword('example').addKeyword('x-consume')]
    }
  });

  tempServer.addHook('onRoute', (routeOptions) => {
    routes.push(routeOptions);
  });

  tempServer.register(handler);

  const routeBuilder = async (server: Server): Promise<void> => {
    const { authenticate, recaptcha, turnstile } = server;

    // Add all currently configured schemas to the temporary server
    for (const [id, schema] of Object.entries(server.getSchemas())) {
      if (!tempServer.getSchema(id)) {
        tempServer.addSchema({ ...(schema as TObject), $id: id });
      }
    }

    // Route array will be filled via the 'onRoute' hook after this step
    await tempServer.ready();

    for (const route of routes) {
      const captchaConfig = {
        recaptcha: config?.recaptcha,
        recaptchaAction: config?.recaptchaAction,
        turnstile: config?.turnstile,
        turnstileAction: config?.turnstileAction
      };
      const captchaHeader = captchaHeaderSchema(captchaConfig);

      // Automatically project virtual fields onto response payloads for routes
      // whose response schemas reference resource models
      const projectionPlan = buildVirtualProjectionPlan(
        route.schema?.response as Record<string, unknown> | undefined,
        (id) => server.getSchema(id)
      );
      const projectionHook =
        Object.keys(projectionPlan).length > 0
          ? createVirtualProjectionHook(projectionPlan)
          : undefined;

      // Merge received route schema with default values based on configuration
      const mergedRoute = {
        ...route,
        schema: {
          ...route.schema,
          security: config?.public
            ? []
            : authSchema(config?.auth as AuthType[]),
          headers: route.schema?.headers
            ? Type.Composite([
                captchaHeader,
                Type.Composite([route.schema.headers as any])
              ])
            : captchaHeader,
          response: mergeErrorResponses(
            (route.schema?.response as Record<string, unknown>) ?? {},
            errorResponses(
              ...authErrorCodes(
                config?.public ? [] : (config?.auth as AuthType[])
              ),
              ...captchaErrorCodes(captchaConfig)
            )
          )
        },
        onRequest: [
          config?.public ? undefined : authenticate(config?.auth as AuthType[]),
          config?.recaptcha || config?.recaptchaAction ? recaptcha : undefined,
          config?.turnstile || config?.turnstileAction ? turnstile : undefined,
          ...(isArray(route.onRequest) ? route.onRequest : [route.onRequest])
        ].filter((h) => h !== undefined),
        preSerialization: [
          ...(isArray(route.preSerialization)
            ? route.preSerialization
            : [route.preSerialization]),
          projectionHook
        ].filter((h) => h !== undefined),
        config: {
          ...config,
          ...route.config
        }
      };

      logger.debug(
        { method: mergedRoute.method, url: mergedRoute.url },
        'Registered route'
      );

      server.route(mergedRoute);
    }
  };

  define(routeBuilder, ROUTE, 'append');
}
