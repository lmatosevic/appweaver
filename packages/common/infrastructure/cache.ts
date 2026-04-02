import { OnInit } from '../interfaces';
import { LIFECYCLE } from '../constants';

export type CacheEntryMeta = {
  key: string;
  sizeBytes: number | null;
  usedCount: number;
  createdAt: number;
  lastUsedAt: number;
  expiresAt?: number;
};

export abstract class Cache implements OnInit {
  static [LIFECYCLE] = true;

  abstract onInit(): Promise<void>;

  /**
   * Retrieves a cached value by key.
   *
   * @param {string} key - The cache key.
   * @returns The cached value, or `null` if not found.
   */
  abstract get<T>(key: string): Promise<T | null>;

  /**
   * Checks whether a key exists in the cache.
   *
   * @param {string} key - The cache key.
   */
  abstract has(key: string): Promise<boolean>;

  /**
   * Stores a value in the cache.
   *
   * @param {string} key - The cache key.
   * @param {Object} value - The value to store.
   * @param {number} [ttl] - Optional time-to-live in milliseconds.
   * @returns `true` if stored successfully.
   */
  abstract set(key: string, value: any, ttl?: number): Promise<boolean>;

  /**
   * Removes a single entry from the cache.
   *
   * @param {string} key - The cache key to evict.
   * @returns `true` if the entry was removed, `false` otherwise.
   */
  abstract evict(key: string): Promise<boolean>;

  /**
   * Expires (removes) all entries matching the given key pattern.
   *
   * @param {string} [pattern] - Optional glob/pattern to filter keys.
   * @returns The number of entries removed.
   */
  abstract expire(pattern?: string): Promise<number>;

  /**
   * Returns all cache keys matching the given pattern.
   *
   * @param {string} [pattern] - Optional glob/pattern to filter keys.
   * @returns {Promise<string[]>} The promise that resolves to the array of keys found matching the pattern.
   */
  abstract keys(pattern?: string): Promise<string[]>;
}
