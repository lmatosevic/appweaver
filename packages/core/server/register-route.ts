import Fastify, { RouteOptions } from 'fastify';
import {
  CacheConfig,
  isArray,
  objectHasProperty,
  RouteConfig
} from '@appweaver/common';
import { context, define } from '../context';
import { AllErrorResponses } from '../errors';
import { resourceModelProps } from '../utils';
import { RouterHandler, Server } from '../types';
import { ROUTE } from '../constants';

export function registerRoute(
  handler: RouterHandler,
  config?: RouteConfig & CacheConfig
): void {
  const routes: RouteOptions[] = [];
  const tempServer = Fastify({ logger: false });

  tempServer.addHook('onRoute', (routeOptions) => {
    routes.push(routeOptions);
  });

  tempServer.register(handler);

  const routeBuilder = async (server: Server): Promise<void> => {
    const { auth, authenticateJWT } = server;

    // Add all resource model schemas to the temporary server
    for (const [name, model] of Object.entries(context.resource.models)) {
      for (const [suffix, property] of Object.entries(resourceModelProps)) {
        const modelName = `${name}${suffix}`;
        const modelSchema = model[property].$defs[modelName];
        if (modelSchema.$id && !tempServer.getSchema(modelSchema.$id)) {
          tempServer.addSchema({ ...modelSchema });
        }
      }
    }

    // Routes array will be filled after this step through the 'onRoute' hook
    await tempServer.ready();

    for (const route of routes) {
      if (route.schema) {
        // Add schemas for resource models that are not yet added but used in this route
        for (const [name, model] of Object.entries(context.resource.models)) {
          for (const [suffix, property] of Object.entries(resourceModelProps)) {
            const modelName = `${name}${suffix}`;
            const modelSchema = model[property].$defs[modelName];

            // Add schema if it's referenced in the route schema
            if (objectHasProperty(route.schema, '$ref', modelName)) {
              if (modelSchema.$id && !server.getSchema(modelSchema.$id)) {
                server.addSchema({ ...modelSchema });
              }
            }
          }
        }
      }

      // Merge received route schema with default values based on configuration
      const mergedRoute = {
        ...route,
        schema: {
          security: config?.public ? [] : [{ bearer: [] }],
          ...route.schema,
          response: {
            ...(route.schema?.response ?? {}),
            ...AllErrorResponses
          }
        },
        preHandler: [
          config?.public ? undefined : auth(config?.auth ?? [authenticateJWT]),
          ...(isArray(route.preHandler) ? route.preHandler : [route.preHandler])
        ].filter((h) => h !== undefined),
        config: {
          ...config,
          ...route.config
        }
      };

      server.route(mergedRoute);
    }
  };

  define(routeBuilder, ROUTE, true);
}
