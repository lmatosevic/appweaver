import { CacheEntryMeta } from '@appweaver/common';
import { LfuEvictionIndex } from '../../../cache/eviction/lfu-eviction-index';

const NOW = 100_000;

const meta = (usedCount: number, createdAt: number = 0): CacheEntryMeta => ({
  key: 'key',
  createdAt,
  lastUsedAt: createdAt,
  usedCount,
  sizeBytes: 10
});

describe('lfu-eviction-index', () => {
  let index: LfuEvictionIndex;

  beforeEach(() => {
    index = new LfuEvictionIndex();
  });

  describe('evictionCandidates', () => {
    test('returns the least frequently used key', () => {
      index.add('hot', meta(100));
      index.add('cold', meta(1));
      index.add('warm', meta(10));

      expect(index.evictionCandidates(1, NOW, 0)).toEqual(['cold']);
    });

    test('returns the requested number of the least used keys', () => {
      index.add('hot', meta(100));
      index.add('cold', meta(1));
      index.add('warm', meta(10));

      expect(index.evictionCandidates(2, NOW, 0).sort()).toEqual([
        'cold',
        'warm'
      ]);
    });

    test('prefers older entries with the same usage count', () => {
      index.add('old', meta(5, 0));
      index.add('recent', meta(5, NOW - 1000));

      expect(index.evictionCandidates(1, NOW, 0)).toEqual(['old']);
    });

    test('picks up the usage count updated by a touch', () => {
      index.add('a', meta(1));
      index.add('b', meta(2));

      index.touch('a', meta(100));

      expect(index.evictionCandidates(1, NOW, 0)).toEqual(['b']);
    });

    test('skips entries still inside the grace period', () => {
      index.add('old', meta(50, NOW - 5000));
      index.add('fresh', meta(1, NOW - 100));

      expect(index.evictionCandidates(2, NOW, 1000)).toEqual(['old']);
    });

    test('returns every eligible key when more are requested', () => {
      index.add('a', meta(1));
      index.add('b', meta(2));

      expect(index.evictionCandidates(10, NOW, 0).sort()).toEqual(['a', 'b']);
    });

    test('returns an empty array for an empty index', () => {
      expect(index.evictionCandidates(3, NOW, 0)).toEqual([]);
    });

    test('returns an empty array when no candidates are requested', () => {
      index.add('a', meta(1));
      index.add('b', meta(2));

      expect(index.evictionCandidates(0, NOW, 0)).toEqual([]);
      expect(index.evictionCandidates(-1, NOW, 0)).toEqual([]);
    });

    test('selects the lowest scored keys out of many entries', () => {
      for (let i = 1; i <= 20; i++) {
        index.add(`key-${i}`, meta(i));
      }

      expect(index.evictionCandidates(3, NOW, 0).sort()).toEqual([
        'key-1',
        'key-2',
        'key-3'
      ]);
    });
  });

  describe('remove', () => {
    test('removes a key from the candidates', () => {
      index.add('a', meta(1));
      index.add('b', meta(2));

      index.remove('a');

      expect(index.evictionCandidates(2, NOW, 0)).toEqual(['b']);
    });

    test('ignores an unknown key', () => {
      expect(() => index.remove('missing')).not.toThrow();
    });
  });
});
