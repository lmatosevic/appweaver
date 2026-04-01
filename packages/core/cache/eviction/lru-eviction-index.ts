import { CacheEntryMeta } from '@appweaver/common';
import { EvictionIndex } from './eviction-index';

type DLLNode = {
  key: string;
  meta: CacheEntryMeta;
  prev: DLLNode | null;
  next: DLLNode | null;
};

export class LruEvictionIndex implements EvictionIndex {
  /** @internal */
  private readonly _nodes = new Map<string, DLLNode>();
  /** @internal */
  private _head: DLLNode | null = null;
  /** @internal */
  private _tail: DLLNode | null = null;

  public add(key: string, meta: CacheEntryMeta): void {
    if (this._nodes.has(key)) {
      this.remove(key);
    }

    const node: DLLNode = {
      key,
      meta,
      prev: null,
      next: null
    };

    this.appendToTail(node);
    this._nodes.set(key, node);
  }

  public remove(key: string): void {
    const node = this._nodes.get(key);
    if (!node) {
      return;
    }

    this.detach(node);
    this._nodes.delete(key);
  }

  public touch(key: string, meta: CacheEntryMeta): void {
    const node = this._nodes.get(key);
    if (!node) {
      return;
    }

    this.detach(node);
    this.appendToTail(node);
  }

  public evictCandidates(
    count: number,
    now: number,
    gracePeriod: number
  ): string[] {
    const candidates: string[] = [];
    let current = this._head;

    while (current && candidates.length < count) {
      if (current.meta.createdAt + gracePeriod < now) {
        candidates.push(current.key);
      }
      current = current.next;
    }

    return candidates;
  }

  /** @internal */
  private appendToTail(node: DLLNode): void {
    node.prev = this._tail;
    node.next = null;

    if (this._tail) {
      this._tail.next = node;
    } else {
      this._head = node;
    }

    this._tail = node;
  }

  /** @internal */
  private detach(node: DLLNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this._head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this._tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }
}
