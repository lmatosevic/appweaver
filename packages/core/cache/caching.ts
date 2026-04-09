import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import {
  AuthUser,
  isFunction,
  RouteCacheConfig,
  RouteConfig
} from '@appweaver/common';
import { CacheService } from './cache-service';
import { inject } from '../context';
import { Server } from '../types';
import { requestContext } from '@fastify/request-context';

type FullRouteConfig = RouteConfig & RouteCacheConfig;

export type CacheEntry = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  payload: string;
};

export default fastifyPlugin((server: Server) => {
  const { currentUser } = server;

  const cacheService = inject(CacheService);

  server.addHook('preHandler', async (request, reply) => {
    const config = getRouteConfig(request);
    if (!shouldUseCache(request, config)) {
      return;
    }

    const user = config.public ? undefined : currentUser();
    const key = buildCacheKey(request, config, cacheService, user);

    const entry = await cacheService.getCachedValue<CacheEntry>(key);
    if (entry) {
      requestContext.set('cached', true);
      return reply
        .code(entry.statusCode)
        .headers(entry.headers)
        .send(entry.payload);
    }
  });

  server.addHook('onSend', async (request, reply, payload) => {
    const config = getRouteConfig(request);
    if (!shouldUseCache(request, config)) {
      return payload;
    }

    if (
      reply.statusCode >= 200 &&
      reply.statusCode < 300 &&
      !requestContext.get('cached')
    ) {
      const user = config.public ? undefined : currentUser();
      const key = buildCacheKey(request, config, cacheService, user);
      await cacheService.addToCache(
        key,
        {
          statusCode: reply.statusCode,
          headers: reply.getHeaders(),
          payload
        },
        config.cacheTTL
      );
    }

    return payload;
  });
});

function getRouteConfig(req: FastifyRequest): FullRouteConfig {
  return req.routeOptions.config as FullRouteConfig;
}

function shouldUseCache(
  req: FastifyRequest,
  config: RouteCacheConfig
): boolean {
  return !!(
    (req.method === 'GET' || req.method === 'POST') &&
    (config.cacheTTL || config.cacheKey || config.cache) &&
    config.cache !== false
  );
}

function buildCacheKey(
  req: FastifyRequest,
  config: RouteCacheConfig,
  cacheService: CacheService,
  user?: AuthUser
): string {
  return isFunction(config.cacheKey)
    ? config.cacheKey(req, user)
    : config.cacheKey ||
        cacheService.buildCacheKey({
          baseKey: 'req',
          method: req.method,
          url: req.raw.url,
          body: req.body as string,
          modelName: config.cacheModelName,
          relations: config.cacheRelations,
          skipInvalidation: config.cacheSkipInvalidation,
          authUser: user
        });
}
