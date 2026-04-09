import {
  ActionType,
  AuthUser,
  Cache,
  CacheInvalidationStrategy,
  config,
  logger,
  makeHash,
  RelationOutput,
  ResourceModel
} from '@appweaver/common';
import { stringify } from 'flatted';
import { context, inject, injectModel } from '../context';

export class CacheService {
  /** @internal */
  private readonly _cache = inject(Cache);

  /**
   * Retrieves the cache instance associated with this service.
   *
   * @return {Cache} The current cache instance.
   */
  get cache(): Cache {
    return this._cache;
  }

  /**
   * Retrieves a cached value associated with the specified key.
   *
   * @param {string} key - The key used to look up the cached value.
   * @return A promise that resolves to the cached value if the key exists, or null if the key is not found.
   */
  public async getCachedValue<T>(key: string): Promise<T | null> {
    const exists = await this._cache.has(key);
    if (exists) {
      logger.debug({ key }, 'Retrieved value from cache');
      return this._cache.get<T>(key);
    }
    return null;
  }

  /**
   * Adds a key-value pair to the cache if the key does not already exist.
   * Optionally allows specifying a time-to-live (TTL) for the cached item.
   *
   * @param {string} key - The unique key to identify the value in the cache.
   * @param {Object} value - The value to store in the cache.
   * @param {number} [ttl] - Optional time-to-live for the cache entry in seconds.
   * @param {boolean} [replace=false] - Optional flag that indicates if the existing cache entry should be replaced
   * with the new value and ttl.
   * @return {Promise<boolean>} A promise that resolves to true if the key-value pair was added, or false if the key
   * already exists.
   */
  public async addToCache(
    key: string,
    value: any,
    ttl?: number,
    replace: boolean = false
  ): Promise<boolean> {
    const exists = await this._cache.has(key);
    if (exists && !replace) {
      return false;
    }
    logger.debug({ key, ttl, replace }, 'Added value to cache');
    return this._cache.set(key, value, ttl);
  }

  /**
   * Removes a cached value associated with the specified key from the cache store.
   *
   * @param {string} key - The key associated with the cached value to be removed.
   * @return {Promise<boolean>} A promise that resolves to `true` if the value was successfully removed, or
   * `false` otherwise.
   */
  public async removeCachedValue(key: string): Promise<boolean> {
    const removed = await this._cache.evict(key);
    if (removed) {
      logger.debug({ key }, 'Removed value from cache');
    }
    return removed;
  }

  /**
   * Invalidates the cache for the specified model and action type based on the configured cache invalidation strategy.
   *
   * @param {string} modelName - The name of the model whose cache needs to be invalidated.
   * @param {Extract<ActionType, 'create' | 'update' | 'delete'>} action - The action type that triggered the cache
   * invalidation (e.g., 'create', 'update', or 'delete').
   * @return {Promise<void>} Resolves when the cache invalidation process is completed.
   */
  public async invalidateCache(
    modelName: string,
    action: Extract<ActionType, 'create' | 'update' | 'delete'>
  ): Promise<void> {
    if (!config.CACHE_ENABLED) {
      return;
    }

    const strategy = config.CACHE_INVALIDATION_STRATEGY;

    logger.debug(
      { modelName, action, strategy },
      `Invalidating resource cache`
    );

    let invalidation: Promise<number> | undefined;
    switch (strategy) {
      case CacheInvalidationStrategy.ExpireRelated:
        invalidation = this._cache.expire(`*!${modelName}!*:inv`);
        break;
      case CacheInvalidationStrategy.ExpireAll:
        invalidation = this._cache.expire(`*:inv`);
        break;
    }

    if (invalidation) {
      if (config.CACHE_INVALIDATION_DEFERRED) {
        void invalidation.catch((error) => {
          logger.error(error, 'Cache invalidation error');
        });
      } else {
        try {
          await invalidation;
        } catch (error) {
          logger.error(error, 'Cache invalidation error');
        }
      }
    }
  }

  /**
   * Builds a unique cache key based on the provided input parameters. The key is constructed
   * using properties such as the base key, HTTP method, URL, request body, model name, and any
   * associated relations. It also includes optional user-specific data and cache invalidation settings.
   *
   * @param {Object} data Input data for constructing the cache key.
   * @param {string} data.baseKey The base key that serves as the starting point of the cache key.
   * @param {string} [data.method] The HTTP method (e.g., GET, POST) associated with the key.
   * @param {string} [data.url] The URL associated with the request.
   * @param {string} [data.body] The stringified request body, which will be hashed if present.
   * @param {string} [data.modelName] The name of the model to associate with the cache key.
   * @param {string[]} [data.relations] A list of related model names to associate with the cache key.
   * @param {boolean} [data.skipInvalidation] Whether to skip invalidation logic for this cache key.
   * @param {AuthUser} [data.authUser] The authenticated user information, if applicable, to create user-specific keys.
   * @return {string} The generated cache key string.
   */
  public buildCacheKey(data: {
    baseKey: string;
    method?: string;
    url?: string;
    body?: string;
    modelName?: string;
    relations?: string[];
    skipInvalidation?: boolean;
    authUser?: AuthUser;
  }): string {
    const userPrefix = data.authUser ? data.authUser.id : '';
    const bodyHash = data.body ? makeHash(stringify(data.body)) : '';

    // Extract model relations based on route cache config so they can be used to
    // evict cache entries when related data changes
    const allRelations: string[] = [];
    if (data.relations?.[0] === '*' || data.modelName) {
      if (data.modelName) {
        // Add all relations from a specified model
        const model = injectModel(data.modelName, false);
        if (model) {
          allRelations.push(...this.collectAllRelations(model));
        }
      } else {
        // Add all defined models as relations
        for (const model of context.resource.models.values()) {
          for (const relation of Object.values(model.config.relations ?? {})) {
            allRelations.push(relation.model);
          }
        }
      }
    } else if (data.relations && data.relations.length > 1) {
      allRelations.push(...data.relations);
    }

    // Create a list of unique relation names
    const relations = [...new Set(allRelations)];
    const relationList = relations.length > 0 ? `!${relations.join('!')}!` : '';

    const invalidateSuffix = data.skipInvalidation ? '' : 'inv';

    return [
      data.baseKey,
      userPrefix,
      data.method,
      data.url,
      bodyHash,
      relationList,
      invalidateSuffix
    ]
      .filter((v) => !!v)
      .join(':');
  }

  /** @internal */
  private collectAllRelations(model: ResourceModel): string[] {
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
        this.traverseInclude(relation.output.include, model, relations);
      }
    }

    return relations;
  }

  /** @internal */
  private traverseInclude(
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
        this.traverseInclude(includeConfig.include, model, acc);
      }
    }
  }
}
