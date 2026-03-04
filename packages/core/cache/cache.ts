import {
  Cache as CommonCache,
  CacheEntryMeta,
  Memory
} from '@appweaver/common';

export abstract class Cache extends CommonCache {
  protected constructor(private readonly memory: Memory) {
    super();
  }

  async get<T>(key: string): Promise<T | null> {
    return null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    return;
  }

  async has(key: string): Promise<boolean> {
    return false;
  }

  async evict(key: string): Promise<void> {
    return;
  }

  async expire(pattern?: string): Promise<void> {
    return;
  }

  async entries(pattern?: string): Promise<CacheEntryMeta[]> {
    return [];
  }
}
