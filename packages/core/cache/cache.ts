import {
  Cache as CommonCache,
  CacheEntryMeta,
  CacheEvictionStrategy,
  config,
  logger,
  Memory
} from '@appweaver/common';

export abstract class Cache extends CommonCache {
  /** @internal */
  private readonly _entryMeta: Record<string, CacheEntryMeta> = {};

  protected constructor(private readonly memory: Memory) {
    super();
  }

  public async init(): Promise<void> {
    if (config.CACHE_ENABLED && config.CACHE_CLEAN_START) {
      await this.expire();
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    const prefixedKey = this.addPrefix(key);

    const data = await this.memory.getValue<T>(prefixedKey);

    if (data) {
      const keyMeta = this._entryMeta[prefixedKey];
      const now = Date.now();
      const count = keyMeta?.usedCount ?? 0;
      this._entryMeta[prefixedKey] = {
        ...(keyMeta || { key, createdAt: now }),
        usedCount: count + 1,
        lastUsedAt: now
      };
    } else if (prefixedKey in this._entryMeta) {
      delete this._entryMeta[prefixedKey];
    }

    return data;
  }

  public async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const prefixedKey = this.addPrefix(key);
    const expireMs = ttl === 0 ? undefined : (ttl ?? config.CACHE_DEFAULT_TTL);

    const result = await this.memory.putValue(prefixedKey, value, expireMs);

    const now = Date.now();
    this._entryMeta[prefixedKey] = {
      key,
      usedCount: 1,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: expireMs ? now + expireMs : undefined
    };

    await this.evictExcessEntries();

    return result;
  }

  public async has(key: string): Promise<boolean> {
    return this.memory.hasKey(this.addPrefix(key));
  }

  public async evict(key: string): Promise<boolean> {
    const prefixedKey = this.addPrefix(key);

    const result = await this.memory.removeValue(prefixedKey);
    delete this._entryMeta[prefixedKey];

    return result;
  }

  public async expire(pattern: string = '*'): Promise<number> {
    const prefixedPattern = this.addPrefix(pattern);
    const prefixedKeys = await this.memory.findKeys(prefixedPattern);

    await this.memory.removeEntries(prefixedPattern);

    for (const prefixedKey of prefixedKeys) {
      delete this._entryMeta[prefixedKey];
    }

    return prefixedKeys.size;
  }

  public async keys(pattern: string = '*'): Promise<string[]> {
    const prefixedPattern = this.addPrefix(pattern);
    const prefixedKeys = await this.memory.findKeys(prefixedPattern);
    return Array.from(prefixedKeys);
  }

  /** @internal */
  private async evictExcessEntries(): Promise<void> {
    const expiredKeys: string[] = [];
    const now = Date.now();
    const strategy = config.CACHE_EVICTION_STRATEGY;

    for (const [prefixedKey, meta] of Object.entries(this._entryMeta)) {
      if (meta.expiresAt && meta.expiresAt < now) {
        expiredKeys.push(prefixedKey);
      }
    }

    // Delete expired entries metadata first, underlying memory implementation
    // should have already removed cached values
    for (const expiredKey of expiredKeys) {
      delete this._entryMeta[expiredKey];
    }

    // Calculate the number of entries that should be evicted
    const excessCount =
      Object.keys(this._entryMeta).length - config.CACHE_MAX_ITEMS;
    if (excessCount <= 0) {
      return;
    }

    // Sort entries based on eviction strategy
    let sortedEntries: CacheEntryMeta[] = [];
    switch (strategy) {
      case CacheEvictionStrategy.LRU:
        sortedEntries = Object.values(this._entryMeta).sort(
          (first: CacheEntryMeta, second: CacheEntryMeta) =>
            (first.lastUsedAt ?? 0) - (second.lastUsedAt ?? 0)
        );
        break;
      case CacheEvictionStrategy.LFU:
        sortedEntries = Object.values(this._entryMeta).sort(
          (first: CacheEntryMeta, second: CacheEntryMeta) =>
            first.usedCount / (now - first.createdAt) -
            second.usedCount / (now - second.createdAt)
        );
        break;
      case CacheEvictionStrategy.FIFO:
        sortedEntries = Object.values(this._entryMeta).sort(
          (first: CacheEntryMeta, second: CacheEntryMeta) =>
            first.createdAt - second.createdAt
        );
        break;
    }

    // Evict entries based on the sorted order, do not evict entries that are
    // created recently (eviction timeout)
    const evictActions: Promise<boolean>[] = [];
    for (let i = 0; i < sortedEntries.length; i++) {
      if (evictActions.length === excessCount) {
        break;
      }

      const entry = sortedEntries[i];
      if (
        entry &&
        [CacheEvictionStrategy.LRU, CacheEvictionStrategy.LFU].includes(
          strategy
        ) &&
        entry.createdAt + config.CACHE_EVICTION_GRACE_PERIOD < now
      ) {
        evictActions.push(this.evict(entry.key));
      }
    }

    if (config.CACHE_EVICTION_DEFERRED) {
      Promise.all(evictActions).catch((error) => {
        logger.error(error, 'Cache eviction error');
      });
    } else {
      await Promise.all(evictActions);
    }
  }

  /** @internal */
  private addPrefix(key: string): string {
    const prefix = config.CACHE_KEY_PREFIX;
    if (key.startsWith(prefix)) {
      return key;
    }
    return `${prefix}${key}`;
  }
}
