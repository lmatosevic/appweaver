import { CacheEntryMeta } from '@appweaver/common';

/**
 * Interface representing operations for managing eviction policies in a cache system.
 */
export interface EvictionIndex {
  /**
   * Called when a key-value pair is added to the cache with associated metadata.
   *
   * @param {string} key - The unique identifier for the cache entry.
   * @param {CacheEntryMeta} meta - The metadata associated with the cache entry.
   */
  add(key: string, meta: CacheEntryMeta): void;

  /**
   * Called when a cache entry is removed from the cache by the specified key.
   *
   * @param {string} key - The unique identifier for the removed entry.
   */
  remove(key: string): void;

  /**
   * Updates the metadata of a cached entry identified by the provided key.
   *
   * @param {string} key - The unique identifier for the accessed cache entry.
   * @param {CacheEntryMeta} meta - The metadata object containing updated information for the cache entry.
   */
  touch(key: string, meta: CacheEntryMeta): void;

  /**
   * Returns a list of cache keys that meet the eviction criteria.
   *
   * @param {number} count - The maximum number of candidates to evict.
   * @param {number} now - The current timestamp used to determine eligibility for eviction.
   * @param {number} gracePeriod - The allowed time period after which candidates are eligible for eviction.
   * @return {string[]} A list of keys for the cache entries to evict.
   */
  evictionCandidates(count: number, now: number, gracePeriod: number): string[];
}
