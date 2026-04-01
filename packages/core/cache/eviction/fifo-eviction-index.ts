import { CacheEntryMeta } from '@appweaver/common';
import { EvictionIndex } from './eviction-index';

export class FifoEvictionIndex implements EvictionIndex {
  /** @internal */
  private readonly _keys = new Map<string, CacheEntryMeta>();

  public add(key: string, meta: CacheEntryMeta): void {
    this._keys.set(key, meta);
  }

  public remove(key: string): void {
    this._keys.delete(key);
  }

  public touch(_key: string, _meta: CacheEntryMeta): void {
    // FIFO strategy ignores access recency or frequency
  }

  /** @internal */
  public evictCandidates(count: number): string[] {
    const candidates: string[] = [];

    for (const [key] of this._keys) {
      if (candidates.length >= count) {
        break;
      }
      candidates.push(key);
    }

    return candidates;
  }
}
