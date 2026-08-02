import { CacheEntryMeta } from '@appweaver/common';
import { FifoEvictionIndex } from '../../../cache/eviction/fifo-eviction-index';

const meta = (createdAt: number, usedCount: number = 0): CacheEntryMeta => ({
  key: 'key',
  createdAt,
  lastUsedAt: createdAt,
  usedCount,
  sizeBytes: 10
});

describe('fifo-eviction-index', () => {
  let index: FifoEvictionIndex;

  beforeEach(() => {
    index = new FifoEvictionIndex();
  });

  describe('evictionCandidates', () => {
    test('returns the keys in insertion order', () => {
      index.add('a', meta(1));
      index.add('b', meta(2));
      index.add('c', meta(3));

      expect(index.evictionCandidates(2)).toEqual(['a', 'b']);
    });

    test('returns every key when more are requested than available', () => {
      index.add('a', meta(1));

      expect(index.evictionCandidates(5)).toEqual(['a']);
    });

    test('returns an empty array for an empty index', () => {
      expect(index.evictionCandidates(3)).toEqual([]);
    });

    test('returns an empty array when no candidates are requested', () => {
      index.add('a', meta(1));

      expect(index.evictionCandidates(0)).toEqual([]);
    });

    test('ignores access recency', () => {
      index.add('a', meta(1));
      index.add('b', meta(2));
      index.touch('a', meta(1, 10));

      expect(index.evictionCandidates(1)).toEqual(['a']);
    });
  });

  describe('remove', () => {
    test('removes a key from the candidates', () => {
      index.add('a', meta(1));
      index.add('b', meta(2));

      index.remove('a');

      expect(index.evictionCandidates(2)).toEqual(['b']);
    });

    test('ignores an unknown key', () => {
      index.add('a', meta(1));

      expect(() => index.remove('missing')).not.toThrow();
      expect(index.evictionCandidates(1)).toEqual(['a']);
    });
  });

  describe('add', () => {
    test('keeps the original position when a key is added again', () => {
      index.add('a', meta(1));
      index.add('b', meta(2));
      index.add('a', meta(3));

      expect(index.evictionCandidates(2)).toEqual(['a', 'b']);
    });
  });
});
