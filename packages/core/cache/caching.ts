import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { stringify } from 'flatted';
import {
  Cache,
  isFunction,
  makeHash,
  RelationOutput,
  RouteCacheConfig,
  RouteConfig
} from '@appweaver/common';
import { context, inject, injectModel } from '../context';
import { AuthUser, ResourceModel, Server } from '../types';

type FullRouteConfig = RouteConfig & RouteCacheConfig;

export type CacheEntry = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  payload: string;
};

export default fastifyPlugin((server: Server): void => {
  const { currentUser } = server;

  const cache = inject(Cache);

  server.addHook('preHandler', async (request, reply) => {
    const config = getRouteConfig(request);
    if (!shouldUseCache(request, config)) {
      return;
    }

    const user = config.public ? undefined : currentUser();
    const key = buildCacheKey(request, config, user);

    const exists = await cache.has(key);
    if (exists) {
      const entry = await cache.get<CacheEntry>(key);
      if (entry) {
        return reply
          .code(entry.statusCode)
          .headers(entry.headers)
          .send(entry.payload);
      }
    }
  });

  server.addHook('onSend', async (request, reply, payload) => {
    const config = getRouteConfig(request);
    if (!shouldUseCache(request, config)) {
      return payload;
    }

    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      const user = config.public ? undefined : currentUser();
      const key = buildCacheKey(request, config, user);
      const exists = await cache.has(key);
      if (!exists) {
        await cache.set(
          key,
          {
            statusCode: reply.statusCode,
            headers: reply.getHeaders(),
            payload
          },
          config.cacheTTL
        );
      }
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
  user?: AuthUser
): string {
  const cacheKey = config.cacheKey;
  return isFunction(cacheKey)
    ? cacheKey(req, user)
    : cacheKey || resourceBasedCacheKey(req, config, user);
}

function resourceBasedCacheKey(
  req: FastifyRequest,
  config: RouteCacheConfig,
  user?: AuthUser
): string {
  const userPrefix = user ? user.id : '';
  const bodyHash = req.body ? makeHash(stringify(req.body)) : '';

  // Extract model relations based on route cache config so they can be used to
  // evict cache entries when related data changes
  const allRelations: string[] = [];
  if (config.cacheRelations?.[0] === '*' || config.cacheModelName) {
    if (config.cacheModelName) {
      // Add all relations from a specified model
      const model = injectModel(config.cacheModelName, false);
      if (model) {
        allRelations.push(...collectAllRelations(model));
      }
    } else {
      // Add all defined models as relations
      for (const model of context.resource.models.values()) {
        for (const relation of Object.values(model.config.relations ?? {})) {
          allRelations.push(relation.model);
        }
      }
    }
  } else if (config.cacheRelations && config.cacheRelations.length > 1) {
    allRelations.push(...config.cacheRelations);
  }

  // Create a list of unique relation names
  const relations = [...new Set(allRelations)];
  const relationList = relations.length > 0 ? `!${relations.join('!')}!` : '';

  return [userPrefix, req.method, req.raw.url, bodyHash, relationList]
    .filter((v) => v !== '')
    .join(':');
}

function collectAllRelations(model: ResourceModel): string[] {
  const relations: string[] = [];

  // Add the model itself as a relation
  relations.push(model.name);

  // Traverse top-level relations (using their own output config)
  for (const relation of Object.values(model.config.relations ?? {})) {
    const outputType = relation.output?.type;

    if (outputType === 'none') {
      continue;
    }

    relations.push(relation.model);

    // Traverse nested includes (if any)
    if (relation.output?.include) {
      traverseInclude(relation.output.include, model, relations);
    }
  }

  return relations;
}

function traverseInclude(
  include: Record<string, RelationOutput>,
  model: ResourceModel,
  acc: string[]
): void {
  const relations = model.config.relations ?? {};

  for (const [relKey, includeConfig] of Object.entries(include)) {
    const type = includeConfig.type;

    if (type === 'none') {
      continue;
    }

    const relationDef = relations[relKey];
    if (!relationDef) {
      continue;
    }

    acc.push(relationDef.model);

    // If this include has nested includes, recurse
    if (includeConfig.include) {
      traverseInclude(includeConfig.include, model, acc);
    }
  }
}
