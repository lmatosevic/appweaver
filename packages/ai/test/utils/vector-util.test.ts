import { cosineSimilarity, rankBySimilarity } from '../../index';

describe('vector-util', () => {
  describe('cosineSimilarity', () => {
    test('measures the angle of two vectors', () => {
      expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
      expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    });

    test('rejects vectors of different lengths', () => {
      expect(() => cosineSimilarity([1], [1, 2])).toThrow(RangeError);
    });
  });

  describe('rankBySimilarity', () => {
    test('ranks the items, the most similar first', () => {
      const items = [
        { id: 'a', vector: [0, 1] },
        { id: 'b', vector: [1, 0] },
        { id: 'c', vector: [1, 1] }
      ];

      const ranked = rankBySimilarity(
        [1, 0.1],
        items,
        (item) => item.vector,
        2
      );

      expect(ranked.map((entry) => entry.item.id)).toEqual(['b', 'c']);
      expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    });
  });
});
