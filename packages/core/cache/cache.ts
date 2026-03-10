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
  private readonly _entryMeta: Map<string, CacheEntryMeta> = new Map();

  protected constructor(private readonly _memory: Memory) {
    super();
  }

  public async onInit(): Promise<void> {
    if (config.CACHE_ENABLED && config.CACHE_CLEAN_START) {
      await this.expire();
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    const prefixedKey = this.addPrefix(key);

    const data = await this._memory.getValue<T>(prefixedKey);

    if (data) {
      const keyMeta = this._entryMeta.get(prefixedKey);
      const now = Date.now();
      const count = keyMeta?.usedCount ?? 0;
      this._entryMeta.set(prefixedKey, {
        ...(keyMeta || { key, createdAt: now }),
        usedCount: count + 1,
        lastUsedAt: now
      });
    } else if (prefixedKey in this._entryMeta) {
      this._entryMeta.delete(prefixedKey);
    }

    return data;
  }

  public async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const prefixedKey = this.addPrefix(key);
    const expireMs = ttl === 0 ? undefined : (ttl ?? config.CACHE_DEFAULT_TTL);

    await this.evictExcessEntries();

    const result = await this._memory.putValue(prefixedKey, value, expireMs);

    const now = Date.now();
    this._entryMeta.set(prefixedKey, {
      key,
      usedCount: 1,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: expireMs ? now + expireMs : undefined
    });

    return result;
  }

  public async has(key: string): Promise<boolean> {
    return this._memory.hasKey(this.addPrefix(key));
  }

  public async evict(key: string): Promise<boolean> {
    const prefixedKey = this.addPrefix(key);

    const result = await this._memory.removeValue(prefixedKey);
    this._entryMeta.delete(prefixedKey);

    return result;
  }

  public async expire(pattern: string = '*'): Promise<number> {
    const prefixedPattern = this.addPrefix(pattern);
    const prefixedKeys = await this._memory.findKeys(prefixedPattern);

    await this._memory.removeEntries(prefixedPattern);

    for (const prefixedKey of prefixedKeys) {
      this._entryMeta.delete(prefixedKey);
    }

    return prefixedKeys.size;
  }

  public async keys(pattern: string = '*'): Promise<string[]> {
    const prefixedPattern = this.addPrefix(pattern);
    const prefixedKeys = await this._memory.findKeys(prefixedPattern);
    return Array.from(prefixedKeys);
  }

  /** @internal */
  private async evictExcessEntries(): Promise<void> {
    const expiredKeys: string[] = [];
    const now = Date.now();
    const strategy = config.CACHE_EVICTION_STRATEGY;

    for (const [prefixedKey, meta] of this._entryMeta.entries()) {
      if (meta.expiresAt && meta.expiresAt < now) {
        expiredKeys.push(prefixedKey);
      }
    }

    // Delete expired entries metadata first, underlying memory implementation
    // should have already removed cached values
    for (const expiredKey of expiredKeys) {
      this._entryMeta.delete(expiredKey);
    }

    // Calculate the number of entries that should be evicted
    const excessCount = this._entryMeta.size - config.CACHE_MAX_ITEMS + 1;
    if (excessCount <= 0) {
      return;
    }

    // Sort entries based on eviction strategy
    let sortedEntries: CacheEntryMeta[] = [];
    switch (strategy) {
      case CacheEvictionStrategy.LRU:
        sortedEntries = [...this._entryMeta.values()].sort(
          (first: CacheEntryMeta, second: CacheEntryMeta) =>
            (first.lastUsedAt ?? 0) - (second.lastUsedAt ?? 0)
        );
        break;
      case CacheEvictionStrategy.LFU:
        sortedEntries = [...this._entryMeta.values()].sort(
          (first: CacheEntryMeta, second: CacheEntryMeta) =>
            first.usedCount / (now - first.createdAt) -
            second.usedCount / (now - second.createdAt)
        );
        break;
      case CacheEvictionStrategy.FIFO:
        sortedEntries = [...this._entryMeta.values()].sort(
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
