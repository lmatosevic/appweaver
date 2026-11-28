import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { requestContext } from '@fastify/request-context';
import {
  AuthUser,
  ConfigurationError,
  ErrorCode,
  isFunction,
  RouteCache,
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

  // A public scope on an authenticated route would serve one user's response to another
  server.addHook('onRoute', (route) => {
    const config: FullRouteConfig | undefined = route.config;
    const cache = config ? routeCache(config) : undefined;
    if (cache?.scope === 'public' && !config?.public) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `The cache of the authenticated route ${route.method} ${route.url} cannot have the public scope, use the ` +
          `shared scope for a response that does not depend on the user`
      );
    }
  });

  server.addHook('preHandler', async (request, reply) => {
    const config = getRouteConfig(request);
    const cache = cacheOf(request, config);
    if (!cache) {
      return;
    }

    const key = buildCacheKey(request, config, cache, cacheService);
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
    const key = cacheKeys.get(request);
    if (
      key === undefined ||
      reply.statusCode < 200 ||
      reply.statusCode >= 300 ||
      requestContext.get('cached')
    ) {
      return payload;
    }

    await cacheService.addToCache(
      key,
      {
        statusCode: reply.statusCode,
        headers: cachedHeaders(reply.getHeaders()),
        payload
      },
      routeCache(getRouteConfig(request))?.ttl
    );

    return payload;
  });
});

/** The cache of a route config: `true` for the defaults, an object for its options. */
export function routeCache(config: RouteCacheConfig): RouteCache | undefined {
  const { cache } = config;
  if (!cache) {
    return undefined;
  }
  return cache === true ? {} : cache;
}

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

/** The cache of the request, for the reading methods of a route caching them. */
function cacheOf(
  req: FastifyRequest,
  config: FullRouteConfig
): RouteCache | undefined {
  const cache = routeCache(config);
  if (
    !cache ||
    (req.method !== 'GET' && req.method !== 'POST') ||
    (cache.ttl !== undefined && cache.ttl <= 0)
  ) {
    return undefined;
  }
  return cache;
}

function buildCacheKey(
  req: FastifyRequest,
  config: FullRouteConfig,
  cache: RouteCache,
  cacheService: CacheService
): string {
  // An entry per user only in the user scope, the default of an authenticated route
  const scope = cache.scope ?? (config.public ? 'public' : 'user');
  const user: AuthUser | undefined =
    scope === 'user' ? (currentAuthUser() ?? undefined) : undefined;

  if (isFunction(cache.key)) {
    return cache.key(req, user);
  }
  return (
    cache.key ||
    cacheService.buildCacheKey({
      baseKey: scope === 'shared' ? 'req:shared' : 'req',
      method: req.method,
      url: req.raw.url,
      body: req.body as string,
      modelName: cache.modelName,
      relations: cache.relations,
      skipInvalidation: cache.skipInvalidation,
      authUser: user
    })
  );
}
