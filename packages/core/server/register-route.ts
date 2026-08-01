import Fastify, { RouteOptions } from 'fastify';
import { TObject, Type } from '@sinclair/typebox';
import {
  AuthType,
  isArray,
  logger,
  ROUTE,
  RouteCacheConfig,
  RouteConfig
} from '@appweaver/common';
import { define } from '../context';
import { authSchema, recaptchaHeaderSchema } from '../security';
import { AllErrorResponses } from '../errors';
import { Router, Server } from '../types';
import {
  buildVirtualProjectionPlan,
  createVirtualProjectionHook
} from './virtual-projection';

export function registerRoute(
  handler: (router: Router) => void,
  config?: RouteConfig & RouteCacheConfig
): void {
  const routes: RouteOptions[] = [];
  const tempServer = Fastify({
    logger: false,
    ajv: {
      plugins: [(ajv): any => ajv.addKeyword('example')]
    }
  });

  tempServer.addHook('onRoute', (routeOptions) => {
    routes.push(routeOptions);
  });

  tempServer.register(handler);

  const routeBuilder = async (server: Server): Promise<void> => {
    const { authenticate, recaptcha } = server;

    // Add all currently configured schemas to the temporary server
    for (const [id, schema] of Object.entries(server.getSchemas())) {
      if (!tempServer.getSchema(id)) {
        tempServer.addSchema({ ...(schema as TObject), $id: id });
      }
    }

    // Route array will be filled via the 'onRoute' hook after this step
    await tempServer.ready();

    for (const route of routes) {
      const recaptchaHeader = recaptchaHeaderSchema({
        recaptcha: config?.recaptcha,
        recaptchaAction: config?.recaptchaAction
      });

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
                recaptchaHeader,
                Type.Composite([route.schema.headers as any])
              ])
            : recaptchaHeader,
          response: {
            ...(route.schema?.response ?? {}),
            ...AllErrorResponses
          }
        },
        onRequest: [
          config?.public ? undefined : authenticate(config?.auth as AuthType[]),
          config?.recaptcha || config?.recaptchaAction ? recaptcha : undefined,
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
