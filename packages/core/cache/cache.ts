import {
  Cache as CommonCache,
  CacheEntryMeta,
  CacheEvictionStrategy,
  config,
  logger,
  Memory
} from '@appweaver/common';
import {
  EvictionIndex,
  FifoEvictionIndex,
  LfuEvictionIndex,
  LruEvictionIndex
} from './eviction';

export abstract class Cache extends CommonCache {
  /** @internal */
  private readonly _entryMeta: Map<string, CacheEntryMeta> = new Map();
  /** @internal */
  private readonly _evictionIndex: EvictionIndex = this.createEvictionIndex();

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
      const updatedMeta: CacheEntryMeta = {
        ...(keyMeta || { key, createdAt: now }),
        usedCount: count + 1,
        lastUsedAt: now
      };
      this._entryMeta.set(prefixedKey, updatedMeta);
      this._evictionIndex.touch(prefixedKey, updatedMeta);
    } else if (prefixedKey in this._entryMeta) {
      this._entryMeta.delete(prefixedKey);
      this._evictionIndex.remove(prefixedKey);
    }

    return data;
  }

  public async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const prefixedKey = this.addPrefix(key);
    const expireMs = ttl === 0 ? undefined : (ttl ?? config.CACHE_DEFAULT_TTL);

    await this.evictExcessEntries();

    const result = await this._memory.putValue(prefixedKey, value, expireMs);

    const now = Date.now();
    const meta: CacheEntryMeta = {
      key,
      usedCount: 1,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: expireMs ? now + expireMs : undefined
    };

    this._entryMeta.set(prefixedKey, meta);
    this._evictionIndex.add(prefixedKey, meta);

    return result;
  }

  public async has(key: string): Promise<boolean> {
    return this._memory.hasKey(this.addPrefix(key));
  }

  public async evict(key: string): Promise<boolean> {
    const prefixedKey = this.addPrefix(key);

    const result = await this._memory.removeValue(prefixedKey);
    this._entryMeta.delete(prefixedKey);
    this._evictionIndex.remove(prefixedKey);

    return result;
  }

  public async expire(pattern: string = '*'): Promise<number> {
    const prefixedPattern = this.addPrefix(pattern);
    const prefixedKeys = await this._memory.findKeys(prefixedPattern);

    await this._memory.removeEntries(prefixedPattern);

    for (const prefixedKey of prefixedKeys) {
      this._entryMeta.delete(prefixedKey);
      this._evictionIndex.remove(prefixedKey);
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
    const now = Date.now();

    // Delete expired entries metadata first, underlying memory implementation
    // should have already removed cached values
    for (const [prefixedKey, meta] of this._entryMeta.entries()) {
      if (meta.expiresAt && meta.expiresAt < now) {
        this._entryMeta.delete(prefixedKey);
        this._evictionIndex.remove(prefixedKey);
      }
    }

    // Calculate the number of entries that should be evicted
    const excessCount = this._entryMeta.size - config.CACHE_MAX_ITEMS + 1;
    if (excessCount <= 0) {
      return;
    }

    const candidates = this._evictionIndex.evictCandidates(
      excessCount,
      now,
      config.CACHE_EVICTION_GRACE_PERIOD
    );

    const evictActions = candidates.map((key) => this.evict(key));

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

  /** @internal */
  private createEvictionIndex(): EvictionIndex {
    switch (config.CACHE_EVICTION_STRATEGY) {
      case CacheEvictionStrategy.LRU:
        return new LruEvictionIndex();
      case CacheEvictionStrategy.LFU:
        return new LfuEvictionIndex();
      case CacheEvictionStrategy.FIFO:
        return new FifoEvictionIndex();
    }
  }
}
