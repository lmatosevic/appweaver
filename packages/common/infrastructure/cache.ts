export type CacheEntryMeta = {
  key: string;
  usedCount: number;
  createdAt: number;
  lastUsedAt: number;
  expiresAt?: number;
};

export abstract class Cache {
  abstract get<T>(key: string): Promise<T | null>;

  abstract has(key: string): Promise<boolean>;

  abstract set(key: string, value: any, ttl?: number): Promise<void>;

  abstract evict(key: string): Promise<void>;

  abstract expire(pattern?: string): Promise<void>;

  abstract entries(pattern?: string): Promise<CacheEntryMeta[]>;
}
