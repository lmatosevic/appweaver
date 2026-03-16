import Fastify, { RouteOptions } from 'fastify';
import { TObject, Type } from '@sinclair/typebox';
import {
  AuthType,
  isArray,
  logger,
  objectHasProperty,
  ROUTE,
  RouteCacheConfig,
  RouteConfig
} from '@appweaver/common';
import { context, define } from '../context';
import { authSchema, recaptchaHeaderSchema } from '../security';
import { AllErrorResponses } from '../errors';
import { resourceModelProps } from '../utils';
import { RouterHandler, Server } from '../types';

export function registerRoute(
  handler: RouterHandler,
  config?: RouteConfig & RouteCacheConfig
): void {
  const routes: RouteOptions[] = [];
  const tempServer = Fastify({ logger: false });

  tempServer.addHook('onRoute', (routeOptions) => {
    routes.push(routeOptions);
  });

  tempServer.register(handler);

  const routeBuilder = async (server: Server): Promise<void> => {
    const { authenticate, recaptcha } = server;

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

      const defaultAuthTypes = [AuthType.Jwt, AuthType.ApiKey, AuthType.Basic];

      const recaptchaHeader = recaptchaHeaderSchema({
        recaptcha: config?.recaptcha,
        recaptchaAction: config?.recaptchaAction
      });

      // Merge received route schema with default values based on configuration
      const mergedRoute = {
        ...route,
        schema: {
          ...route.schema,
          security: config?.public
            ? []
            : authSchema((config?.auth as AuthType[]) ?? defaultAuthTypes),
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
          config?.public
            ? undefined
            : authenticate(
                ...((config?.auth as AuthType[]) ?? defaultAuthTypes)
              ),
          config?.recaptcha || config?.recaptchaAction ? recaptcha : undefined,
          ...(isArray(route.onRequest) ? route.onRequest : [route.onRequest])
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

function iterateResourceModels(
  handler: (name: string, schema: TObject) => void
): void {
  for (const model of context.resource.models.values()) {
    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      const modelName = `${model.name}${suffix}`;
      const modelSchema = model[property].$defs[modelName];
      handler(modelName, modelSchema);
    }
  }
}
