import { CacheEntryMeta } from '@appweaver/common';
import { EvictionIndex } from './eviction-index';

type HeapEntry = {
  key: string;
  meta: CacheEntryMeta;
};

export class LfuEvictionIndex implements EvictionIndex {
  /** @internal */
  private readonly _entries = new Map<string, CacheEntryMeta>();

  public add(key: string, meta: CacheEntryMeta): void {
    this._entries.set(key, meta);
  }

  public remove(key: string): void {
    this._entries.delete(key);
  }

  public touch(key: string, meta: CacheEntryMeta): void {
    this._entries.set(key, meta);
  }

  public evictCandidates(
    count: number,
    now: number,
    gracePeriod: number
  ): string[] {
    // Build a min-heap of size `count` to find the k entries with the lowest
    // frequency score (usedCount / age), avoiding a full sort.
    // Time complexity: O(n log k) where k = count (typically 1).
    const heap: HeapEntry[] = [];

    for (const [key, meta] of this._entries) {
      if (meta.createdAt + gracePeriod >= now) continue;

      const entry: HeapEntry = { key, meta };

      if (heap.length < count) {
        heap.push(entry);
        this.siftUp(heap, heap.length - 1, now);
      } else if (this.score(meta, now) < this.score(heap[0].meta, now)) {
        heap[0] = entry;
        this.siftDown(heap, 0, now);
      }
    }

    // Extract candidates — heap contains the `count` lowest-scored entries
    // We use a max-heap so heap[0] is the largest among selected candidates.
    // All entries in the heap are valid eviction candidates.
    return heap.map((e) => e.key);
  }

  /** @internal */
  private score(meta: CacheEntryMeta, now: number): number {
    const age = now - meta.createdAt;
    return age > 0 ? meta.usedCount / age : Infinity;
  }

  // Max-heap by score: the root has the highest score among selected candidates.
  // When a new entry has a lower score than the root, it replaces the root,
  // ensuring the heap always contains the k lowest-scored entries.
  /** @internal */
  private siftUp(heap: HeapEntry[], index: number, now: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (
        this.score(heap[index].meta, now) <= this.score(heap[parent].meta, now)
      ) {
        break;
      }

      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
  }

  /** @internal */
  private siftDown(heap: HeapEntry[], index: number, now: number): void {
    const length = heap.length;

    while (true) {
      let largest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (
        left < length &&
        this.score(heap[left].meta, now) > this.score(heap[largest].meta, now)
      ) {
        largest = left;
      }

      if (
        right < length &&
        this.score(heap[right].meta, now) > this.score(heap[largest].meta, now)
      ) {
        largest = right;
      }

      if (largest === index) {
        break;
      }

      [heap[index], heap[largest]] = [heap[largest], heap[index]];
      index = largest;
    }
  }
}
