import { CacheEntryMeta } from '@appweaver/common';
import { LruEvictionIndex } from '../../../cache/eviction/lru-eviction-index';

const NOW = 10_000;

const meta = (createdAt: number = 0): CacheEntryMeta => ({
  key: 'key',
  createdAt,
  lastUsedAt: createdAt,
  usedCount: 0,
  sizeBytes: 10
});

describe('lru-eviction-index', () => {
  let index: LruEvictionIndex;

  beforeEach(() => {
    index = new LruEvictionIndex();
  });

  describe('evictionCandidates', () => {
    test('returns the least recently used keys first', () => {
      index.add('a', meta());
      index.add('b', meta());
      index.add('c', meta());

      expect(index.evictionCandidates(2, NOW, 0)).toEqual(['a', 'b']);
    });

    test('moves a touched key to the end of the queue', () => {
      index.add('a', meta());
      index.add('b', meta());
      index.add('c', meta());

      index.touch('a', meta());

      expect(index.evictionCandidates(3, NOW, 0)).toEqual(['b', 'c', 'a']);
    });

    test('keeps the order stable when the last key is touched', () => {
      index.add('a', meta());
      index.add('b', meta());

      index.touch('b', meta());

      expect(index.evictionCandidates(2, NOW, 0)).toEqual(['a', 'b']);
    });

    test('ignores a touch of an unknown key', () => {
      index.add('a', meta());

      index.touch('missing', meta());

      expect(index.evictionCandidates(2, NOW, 0)).toEqual(['a']);
    });

    test('skips entries still inside the grace period', () => {
      index.add('old', meta(NOW - 5000));
      index.add('fresh', meta(NOW - 100));

      expect(index.evictionCandidates(2, NOW, 1000)).toEqual(['old']);
    });

    test('returns no candidates when every entry is within the grace period', () => {
      index.add('a', meta(NOW));

      expect(index.evictionCandidates(2, NOW, 1000)).toEqual([]);
    });

    test('returns an empty array for an empty index', () => {
      expect(index.evictionCandidates(3, NOW, 0)).toEqual([]);
    });
  });

  describe('add', () => {
    test('re-adding a key moves it to the end of the queue', () => {
      index.add('a', meta());
      index.add('b', meta());
      index.add('a', meta());

      expect(index.evictionCandidates(2, NOW, 0)).toEqual(['b', 'a']);
    });
  });

  describe('remove', () => {
    test('removes the head key', () => {
      index.add('a', meta());
      index.add('b', meta());

      index.remove('a');

      expect(index.evictionCandidates(2, NOW, 0)).toEqual(['b']);
    });

    test('removes the tail key', () => {
      index.add('a', meta());
      index.add('b', meta());

      index.remove('b');

      expect(index.evictionCandidates(2, NOW, 0)).toEqual(['a']);
    });

    test('removes a middle key and keeps the list linked', () => {
      index.add('a', meta());
      index.add('b', meta());
      index.add('c', meta());

      index.remove('b');

      expect(index.evictionCandidates(3, NOW, 0)).toEqual(['a', 'c']);
    });

    test('removing every key empties the index', () => {
      index.add('a', meta());
      index.add('b', meta());

      index.remove('a');
      index.remove('b');

      expect(index.evictionCandidates(2, NOW, 0)).toEqual([]);
    });

    test('ignores an unknown key', () => {
      index.add('a', meta());

      expect(() => index.remove('missing')).not.toThrow();
      expect(index.evictionCandidates(1, NOW, 0)).toEqual(['a']);
    });
  });
});
