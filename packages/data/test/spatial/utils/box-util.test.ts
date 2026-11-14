import {
  boxOverlapFilter,
  boxWithinFilter,
  existsFilter
} from '../../../spatial/utils/box-util';

describe('box-util', () => {
  describe('boxWithinFilter', () => {
    test('bounds the box of a geometry by the box', () => {
      expect(boxWithinFilter('area', [[0, 1, 5, 6]])).toEqual({
        areaMinLng: { gte: 0, lte: 5 },
        areaMinLat: { gte: 1, lte: 6 },
        areaMaxLng: { lte: 5 },
        areaMaxLat: { lte: 6 }
      });
    });

    test('matches one of several boxes', () => {
      const filter = boxWithinFilter('area', [
        [170, 0, 180, 1],
        [-180, 0, -170, 1]
      ]);
      expect(filter.OR).toHaveLength(2);
      expect(filter.OR[1].areaMaxLng).toEqual({ lte: -170 });
    });
  });

  describe('boxOverlapFilter', () => {
    test('matches the boxes overlapping the box', () => {
      expect(boxOverlapFilter('area', [[0, 1, 5, 6]])).toEqual({
        areaMinLng: { lte: 5 },
        areaMinLat: { lte: 6 },
        areaMaxLng: { gte: 0 },
        areaMaxLat: { gte: 1 }
      });
    });

    test('bounds a point by its minimums alone', () => {
      expect(boxOverlapFilter('location', [[0, 1, 5, 6]], true)).toEqual({
        locationMinLng: { gte: 0, lte: 5 },
        locationMinLat: { gte: 1, lte: 6 }
      });
    });
  });

  describe('existsFilter', () => {
    test('checks the bounding box of the field', () => {
      expect(existsFilter('area', true)).toEqual({ areaMinLng: { not: null } });
      expect(existsFilter('area', false)).toEqual({ areaMinLng: null });
    });
  });
});
