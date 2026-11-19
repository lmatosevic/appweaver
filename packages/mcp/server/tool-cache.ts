import { AuthUser } from '@appweaver/common';
import { cacheConfig, CacheService, inject } from '@appweaver/core';
import { mcpCacheConfig } from '../config';
import { McpTool } from '../types';

/**
 * Calls a tool, answering a read-only one with `cache` from the cache with `mcp.cache.enabled`: keyed by the tool,
 * the arguments and the user, with the models it reads, so a change of one of them evicts it. A failed call throws,
 * so is never cached.
 *
 * @param {McpTool} tool - The tool.
 * @param {unknown} args - The arguments of the call.
 * @param {AuthUser | null} user - The user of the call, null when anonymous.
 * @param {Function} call - Calls the tool, resolving its result.
 * @return {Promise<{ result, cached: boolean }>} The result, and whether it came from the cache.
 */
export async function cachedToolCall<T>(
  tool: McpTool,
  args: unknown,
  user: AuthUser | null,
  call: () => Promise<T>
): Promise<{ result: T; cached: boolean }> {
  if (
    !tool.cache ||
    !tool.readOnly ||
    !mcpCacheConfig.ENABLED ||
    !cacheConfig.ENABLED
  ) {
    return { result: await call(), cached: false };
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
  const hit = await cacheService.getCachedValue<T>(key);
  if (hit) {
    return { result: hit, cached: true };
  }
  const result = await call();
  await cacheService.addToCache(
    key,
    result,
    tool.cache.ttl ?? mcpCacheConfig.TTL,
    true
  );
  return { result, cached: false };
}
