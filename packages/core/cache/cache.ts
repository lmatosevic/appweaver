import {
  Cache as CommonCache,
  CacheEntryMeta,
  config,
  Memory
} from '@appweaver/common';

export abstract class Cache extends CommonCache {
  /** @internal */
  private readonly _entryMeta: Record<string, CacheEntryMeta> = {};

  protected constructor(private readonly memory: Memory) {
    super();
  }

  async get<T>(key: string): Promise<T | null> {
    const prefixedKey = this.prefixedKey(key);

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
    }

    return data;
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const prefixedKey = this.prefixedKey(key);

    const result = await this.memory.putValue(prefixedKey, value, ttl);

    const now = Date.now();
    this._entryMeta[prefixedKey] = {
      key,
      usedCount: 1,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: ttl === 0 ? undefined : now + (ttl ?? config.CACHE_DEFAULT_TTL)
    };

    return result;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async evict(key: string): Promise<boolean> {
    const prefixedKey = this.prefixedKey(key);

    const result = await this.memory.removeValue(prefixedKey);
    delete this._entryMeta[prefixedKey];

    return result;
  }

  async expire(pattern: string = '*'): Promise<number> {
    const prefixedKeys = await this.memory.findKeys(pattern);

    await this.memory.removeEntries(pattern);

    for (const prefixedKey of prefixedKeys) {
      delete this._entryMeta[prefixedKey];
    }

    return prefixedKeys.size;
  }

  async keys(pattern: string = '*'): Promise<string[]> {
    const prefixedKeys = await this.memory.findKeys(pattern);
    return Array.from(prefixedKeys);
  }

  private prefixedKey(key: string): string {
    const prefix = config.CACHE_KEY_PREFIX;
    if (key.startsWith(prefix)) {
      return key;
    }
    return `${prefix}${key}`;
  }
}
