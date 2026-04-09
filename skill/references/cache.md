# Cache

The cache module provides a key-value store with TTL support, eviction strategies, and automatic invalidation tied to
resource mutations. Two implementations are available: `RedisCache` (production) and `MemoryCache` (
development/testing). Both are accessed through the abstract `Cache` class and the higher-level `CacheService`.

## `Cache` — low-level provider

Inject the abstract `Cache` class directly when you need raw key-value access.

```ts
import { inject } from '@appweaver/core';
import { Cache } from '@appweaver/common';

const cache = inject(Cache);
```

#### `cache.get<T>(key)`

Retrieves a cached value. Returns `null` if the key does not exist.

```ts
const user = await cache.get<User>('user:42');
```

#### `cache.has(key)`

Returns `true` if the key exists and has not expired.

```ts
if (await cache.has('user:42')) { /* ... */
}
```

#### `cache.set(key, value, ttl?)`

Stores a value. `ttl` is in milliseconds; omit to use `CACHE_DEFAULT_TTL`.

```ts
await cache.set('user:42', user, 30_000); // 30 s
```

#### `cache.evict(key)`

Removes a single entry. Returns `true` if the key existed.

```ts
await cache.evict('user:42');
```

#### `cache.expire(pattern?)`

Removes all entries whose keys match a glob pattern. Returns the number of removed entries. Omit `pattern` to expire
everything.

```ts
const removed = await cache.expire('user:*');
```

#### `cache.keys(pattern?)`

Returns all keys matching a glob pattern, or all keys if omitted.

```ts
const keys = await cache.keys('session:*');
```

---

## `CacheService` — high-level helper

`CacheService` wraps `Cache` with duplicate-check logic, debug logging, and resource-aware invalidation. It is
registered automatically by the framework.

```ts
import { inject } from '@appweaver/core';
import { CacheService } from '@appweaver/core';

const cacheService = inject(CacheService);
```

#### `cacheService.getCachedValue<T>(key)`

Returns the cached value or `null`. Logs a debug message on hit.

```ts
const result = await cacheService.getCachedValue<Product[]>('products:all');
```

#### `cacheService.addToCache(key, value, ttl?, replace?)`

Stores a value only if the key does not already exist. Pass `replace: true` to overwrite. Returns `false` if the key
existed and `replace` was not set.

| Parameter | Type      | Default | Description                     |
|-----------|-----------|---------|---------------------------------|
| `key`     | `string`  | —       | Cache key                       |
| `value`   | `any`     | —       | Value to store                  |
| `ttl`     | `number`  | config  | TTL in milliseconds             |
| `replace` | `boolean` | `false` | Overwrite if key already exists |

```ts
await cacheService.addToCache('products:all', products, 60_000);
// Overwrite an existing entry:
await cacheService.addToCache('products:all', updated, 60_000, true);
```

#### `cacheService.removeCachedValue(key)`

Removes a single cached entry. Returns `true` if removed.

```ts
await cacheService.removeCachedValue('products:all');
```

#### `cacheService.invalidateCache(modelName, action)`

Expires cache entries related to a model based on `CACHE_INVALIDATION_STRATEGY`. Called automatically by the framework
after `create`, `update`, and `delete` actions.

| Parameter   | Type                               | Description                          |
|-------------|------------------------------------|--------------------------------------|
| `modelName` | `string`                           | The resource model name              |
| `action`    | `'create' \| 'update' \| 'delete'` | The mutation that triggered eviction |

```ts
await cacheService.invalidateCache('Product', 'update');
```

#### `cacheService.buildCacheKey(data)`

Builds a structured cache key that encodes HTTP method, URL, body hash, relations, and optional user scope.

| Field              | Type       | Description                                     |
|--------------------|------------|-------------------------------------------------|
| `baseKey`          | `string`   | Required prefix                                 |
| `method`           | `string`   | HTTP method                                     |
| `url`              | `string`   | Request URL                                     |
| `body`             | `string`   | Stringified request body (hashed automatically) |
| `modelName`        | `string`   | Model whose relations are embedded in the key   |
| `relations`        | `string[]` | Explicit relation list; use `['*']` for all     |
| `skipInvalidation` | `boolean`  | Omit the invalidation suffix                    |
| `authUser`         | `AuthUser` | Scope the key to the authenticated user         |

```ts
const key = cacheService.buildCacheKey({
  baseKey: 'products',
  method: 'GET',
  url: '/api/products?page=1',
  modelName: 'Product',
  authUser: req.user
});
```

---

## Configuration

| Key                           | Type     | Default                               | Description                                        |
|-------------------------------|----------|---------------------------------------|----------------------------------------------------|
| `CACHE_ENABLED`               | `bool`   | `true`                                | Enables or disables the cache globally             |
| `CACHE_PROVIDER`              | `string` | `'@appweaver/core/cache/redis-cache'` | Path to the Cache implementation                   |
| `CACHE_KEY_PREFIX`            | `string` | `'cache:'`                            | Prefix prepended to every key                      |
| `CACHE_MAX_ITEMS`             | `int`    | `1000`                                | Maximum number of entries before eviction kicks in |
| `CACHE_CACHE_MAX_SIZE`        | `string` | -                                     | Maximum size used by the cache.                    |
| `CACHE_DEFAULT_TTL`           | `int`    | `5000`                                | Default TTL in milliseconds                        |
| `CACHE_EVICTION_STRATEGY`     | `enum`   | `'lru'`                               | `lru`, `lfu`, or `fifo`                            |
| `CACHE_INVALIDATION_STRATEGY` | `enum`   | `'expire-related'`                    | `expire-related`, `expire-all`, or `none`          |
| `CACHE_INVALIDATION_DEFERRED` | `bool`   | `false`                               | Fire invalidation in the background (non-blocking) |

Switch to the in-memory implementation for local development or tests:

```json
{
  "CACHE_PROVIDER": "@appweaver/core/cache/memory-cache"
}
```

---

## Real-world example

```ts
import { inject } from '@appweaver/core';
import { CacheService } from '@appweaver/core';

export class ProductService {
  private readonly _cache = inject(CacheService);

  async getAll(): Promise<Product[]> {
    const key = this._cache.buildCacheKey({ baseKey: 'products:all' });

    const cached = await this._cache.getCachedValue<Product[]>(key);
    if (cached) return cached;

    const products = await fetchFromDatabase();
    await this._cache.addToCache(key, products, 60_000);
    return products;
  }

  async update(id: number, data: Partial<Product>): Promise<Product> {
    const product = await updateInDatabase(id, data);
    await this._cache.invalidateCache('Product', 'update');
    return product;
  }
}
```
