import { AuthUser } from '@appweaver/common';
import { cacheConfig, CacheService, inject } from '@appweaver/core';
import { mcpCacheConfig } from '../config';
import { McpTool } from '../types';

/** A cached result, found or to be stored under its key. */
export type CachedResult<T> = {
  key: string;
  ttl: number;
  value: T | null;
};

/**
 * Looks up the cached result of a call of a read-only tool, keyed by the tool, the arguments and the user, with the
 * models it reads, so a change of one of them evicts it.
 *
 * @param {McpTool} tool - The tool.
 * @param {unknown} args - The arguments of the call.
 * @param {AuthUser | null} user - The user of the call, null when anonymous.
 * @return {Promise<CachedResult | undefined>} The lookup, undefined when the tool is not cached.
 */
export async function findCachedResult<T>(
  tool: McpTool,
  args: unknown,
  user: AuthUser | null
): Promise<CachedResult<T> | undefined> {
  if (
    !tool.cache ||
    !tool.readOnly ||
    !mcpCacheConfig.ENABLED ||
    !cacheConfig.ENABLED
  ) {
    return undefined;
  }
  const cacheService = inject(CacheService);
  const key = cacheService.buildCacheKey({
    baseKey: 'mcp',
    url: tool.name,
    body: args as string,
    modelName: tool.cache.modelName,
    relations: tool.cache.relations,
    authUser: user ?? undefined
  });
  return {
    key,
    ttl: tool.cache.ttl ?? mcpCacheConfig.TTL,
    value: await cacheService.getCachedValue<T>(key)
  };
}

/**
 * Stores the result of a call looked up with {@link findCachedResult}.
 *
 * @param {CachedResult} cached - The lookup.
 * @param {unknown} value - The result.
 * @return {Promise<void>} Resolves when stored.
 */
export async function storeCachedResult<T>(
  cached: CachedResult<T>,
  value: T
): Promise<void> {
  await inject(CacheService).addToCache(cached.key, value, cached.ttl, true);
}
