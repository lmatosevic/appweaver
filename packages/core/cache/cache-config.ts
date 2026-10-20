import { Type } from '@sinclair/typebox';
import {
  defineConfig,
  CacheEvictionStrategy,
  CacheInvalidationStrategy
} from '@appweaver/common';

export const cacheConfig = defineConfig('cache', {
  /** Enable the caching system. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Clear all cache entries on application startup. Default: `false`. */
  CLEAN_START: Type.Boolean({ default: false }),
  /** Prefix prepended to all cache keys. Default: `'cache:'`. */
  KEY_PREFIX: Type.String({ default: 'cache:' }),
  /** Maximum number of items in the cache. Default: `1000`. */
  MAX_ITEMS: Type.Integer({ default: 1000 }),
  /** Maximum size used by the cache. */
  MAX_SIZE: Type.Optional(Type.String()),
  /** Default time-to-live for cache entries in milliseconds. Default: `5000` (5 sec). */
  DEFAULT_TTL: Type.Integer({ default: 5000 }),
  /** Grace period before evicting expired items in milliseconds. Default: `1000` (1 sec). */
  EVICTION_GRACE_PERIOD: Type.Integer({ default: 1000 }),
  /** Eviction strategy. Values: `LRU`, `LFU`, `FIFO`. Default: `'LRU'`. */
  EVICTION_STRATEGY: Type.Enum(CacheEvictionStrategy, {
    default: CacheEvictionStrategy.LRU
  }),
  /** Defer eviction to a background process. Default: `false`. */
  EVICTION_DEFERRED: Type.Boolean({ default: false }),
  /** Invalidation strategy. Values: `expire-related`, `expire-all`, `none`. Default: `'expire-related'`. */
  INVALIDATION_STRATEGY: Type.Enum(CacheInvalidationStrategy, {
    default: CacheInvalidationStrategy.ExpireRelated
  }),
  /** Defer invalidation to a background process. Default: `false`. */
  INVALIDATION_DEFERRED: Type.Boolean({ default: false }),
  /** Return empty results instead of failing when the cache backend errors, e.g. while Redis is down. Default: `true`. */
  SKIP_ON_ERROR: Type.Boolean({ default: true }),
  /** Cache provider implementation path. Default: `'@appweaver/core/cache/redis-cache'`. */
  PROVIDER: Type.String({ default: '@appweaver/core/cache/redis-cache' })
});
