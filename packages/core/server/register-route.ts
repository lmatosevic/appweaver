import Fastify, { RouteOptions } from 'fastify';
import {
  CacheConfig,
  isArray,
  objectHasProperty,
  RouteConfig
} from '@appweaver/common';
import { define } from '../context';
import { AllErrorResponses } from '../errors';
import { iterateResourceModels } from '../utils';
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

    // Add all currently configured schemas to the temporary server
    for (const [id, schema] of Object.entries(server.getSchemas())) {
      if (!tempServer.getSchema(id)) {
        tempServer.addSchema({ $id: id, ...(schema as any) });
      }
    }

    // Add the rest of the resource model schemas to the temporary server
    iterateResourceModels((_, schema) => {
      if (schema.$id && !tempServer.getSchema(schema.$id)) {
        tempServer.addSchema({ ...schema });
      }
    });

    // Routes array will be filled via the 'onRoute' hook after this step
    await tempServer.ready();

    for (const route of routes) {
      // Add schemas for resource models that are not yet added but are used in
      // this route
      iterateResourceModels((name, schema) => {
        // Add schema if it's referenced in the route schema
        if (route.schema && objectHasProperty(route.schema, '$ref', name)) {
          if (schema.$id && !server.getSchema(schema.$id)) {
            server.addSchema({ ...schema });
          }
        }
      });

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
