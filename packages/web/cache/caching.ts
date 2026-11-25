import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { requestContext } from '@fastify/request-context';
import {
  AuthUser,
  isFunction,
  RouteCacheConfig,
  RouteConfig
} from '@appweaver/common';
import { CacheService, inject, currentAuthUser } from '@appweaver/core';
import { Server } from '../types/server';

type FullRouteConfig = RouteConfig & RouteCacheConfig;

export type CacheEntry = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  payload: string;
};

// The headers describing the payload itself. The others belong to the request that produced it (the CORS origin, the
// rate limit counters, the cookies, the request ID) and are set again for every request instead
const CACHED_HEADERS = [
  'content-type',
  'content-disposition',
  'content-language',
  'etag',
  'last-modified'
];

// The key of a request, built once in preHandler and reused in onSend
const cacheKeys = new WeakMap<FastifyRequest, string>();

export default fastifyPlugin((server: Server) => {
  const cacheService = inject(CacheService);

  server.addHook('preHandler', async (request, reply) => {
    const config = getRouteConfig(request);
    if (!shouldUseCache(request, config)) {
      return;
    }

    // No user on a route without authentication
    const user = config.public ? undefined : (currentAuthUser() ?? undefined);
    const key = buildCacheKey(request, config, cacheService, user);
    cacheKeys.set(request, key);

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
      const key =
        cacheKeys.get(request) ??
        buildCacheKey(
          request,
          config,
          cacheService,
          config.public ? undefined : (currentAuthUser() ?? undefined)
        );
      await cacheService.addToCache(
        key,
        {
          statusCode: reply.statusCode,
          headers: cachedHeaders(reply.getHeaders()),
          payload
        },
        config.cacheTTL
      );
    }

    return payload;
  });
});

function cachedHeaders(
  headers: Record<string, unknown>
): Record<string, string | string[]> {
  const cached: Record<string, string | string[]> = {};
  for (const name of CACHED_HEADERS) {
    const value = headers[name];
    if (value !== undefined) {
      cached[name] = value as string | string[];
    }
  }
  return cached;
}

function getRouteConfig(req: FastifyRequest): FullRouteConfig {
  return req.routeOptions.config;
}

function shouldUseCache(
  req: FastifyRequest,
  config: RouteCacheConfig
): boolean {
  return !!(
    (req.method === 'GET' || req.method === 'POST') &&
    (config.cacheTTL || config.cacheKey || config.cache) &&
    (config.cacheTTL === undefined || config.cacheTTL > 0) &&
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
