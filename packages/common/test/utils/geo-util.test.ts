import {
  boxPolygon,
  conditionBox,
  distanceBox,
  EARTH_RADIUS,
  geoColumns,
  geoDistance,
  geometryBox,
  geometryCoveredBy,
  geometryDistance,
  geometryIntersects,
  geometryPositions,
  GeoGeometry,
  GeoPolygon,
  hasGeo,
  matchSpatialCondition,
  normalizeGeometry,
  spatialCondition
} from '../../index';

const square = (
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
): GeoPolygon => boxPolygon([minLng, minLat, maxLng, maxLat]);

const point = (lng: number, lat: number): GeoGeometry => ({
  type: 'Point',
  coordinates: [lng, lat]
});

const line = (...coordinates: [number, number][]): GeoGeometry => ({
  type: 'LineString',
  coordinates
});

describe('geo-util', () => {
  describe('geoColumns', () => {
    test('names the columns kept beside a geo field', () => {
      expect(geoColumns('location')).toEqual({
        minLng: 'locationMinLng',
        minLat: 'locationMinLat',
        maxLng: 'locationMaxLng',
        maxLat: 'locationMaxLat',
        geom: 'locationGeom'
      });
    });
  });

  describe('hasGeo', () => {
    test('checks for at least one geo field', () => {
      expect(hasGeo(undefined)).toBe(false);
      expect(hasGeo({ name: 'Store' })).toBe(false);
      expect(hasGeo({ name: 'Store', geo: {} })).toBe(false);
      expect(
        hasGeo({ name: 'Store', geo: { location: { type: 'point' } } })
      ).toBe(true);
    });
  });

  describe('normalizeGeometry', () => {
    test('takes a { lat, lng } object as a point', () => {
      expect(normalizeGeometry({ lat: '45.8', lng: 15.9 }, 'point')).toEqual({
        type: 'Point',
        coordinates: [15.9, 45.8]
      });
      expect(normalizeGeometry({ lat: 1, lng: 2 })).toEqual(point(2, 1));
    });

    test('keeps the longitude and latitude of each position only', () => {
      expect(
        normalizeGeometry(
          { type: 'Point', coordinates: [1, 2, 300], extra: true },
          'point'
        )
      ).toEqual(point(1, 2));
    });

    test('normalizes every geometry type', () => {
      const ring = square(0, 0, 1, 1).coordinates;
      const cases: GeoGeometry[] = [
        { type: 'MultiPoint', coordinates: [[1, 1]] },
        {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1]
          ]
        },
        {
          type: 'MultiLineString',
          coordinates: [
            [
              [0, 0],
              [1, 1]
            ]
          ]
        },
        { type: 'Polygon', coordinates: ring },
        { type: 'MultiPolygon', coordinates: [ring] }
      ];
      for (const geometry of cases) {
        expect(normalizeGeometry(geometry)).toEqual(geometry);
      }
    });

    test('rejects the values that are no geometry of the field', () => {
      expect(() => normalizeGeometry('x', 'point')).toThrow(
        'or a { lat, lng } object'
      );
      expect(() => normalizeGeometry('x', 'polygon')).toThrow(
        'expected a GeoJSON Polygon'
      );
      expect(() => normalizeGeometry({ lat: 1, lng: 2 }, 'polygon')).toThrow(
        'expected a GeoJSON Polygon'
      );
      expect(() => normalizeGeometry(point(1, 1), 'lineString')).toThrow(
        'not a Point'
      );
      expect(() =>
        normalizeGeometry({ type: 'Circle', coordinates: [] })
      ).toThrow('not a Circle');
      expect(() =>
        normalizeGeometry({ type: 'Point', coordinates: [1] })
      ).toThrow('expected a position');
      expect(() =>
        normalizeGeometry({ type: 'Point', coordinates: [181, 0] })
      ).toThrow('longitude 181');
      expect(() =>
        normalizeGeometry({ type: 'Point', coordinates: [0, -91] })
      ).toThrow('latitude -91');
      expect(() =>
        normalizeGeometry({ type: 'LineString', coordinates: [[0, 0]] })
      ).toThrow('at least 2');
      expect(() =>
        normalizeGeometry({
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1]
            ]
          ]
        })
      ).toThrow('must end with its first position');
    });

    test('rejects a geometry of more positions than the maximum', () => {
      expect(() => normalizeGeometry(square(0, 0, 1, 1), 'polygon', 4)).toThrow(
        '5 positions, more than 4'
      );
    });
  });

  describe('spatialCondition', () => {
    test('normalizes a _near operator, its point in any form', () => {
      for (const near of [[1, 2], { lat: 2, lng: 1 }, point(1, 2)]) {
        expect(
          spatialCondition('_near', { point: near, maxDistance: '10' })
        ).toEqual({
          operator: 'near',
          point: [1, 2],
          maxDistance: 10,
          minDistance: undefined
        });
      }
      expect(
        spatialCondition('_near', {
          point: [1, 2],
          maxDistance: 10,
          minDistance: 5
        })
      ).toMatchObject({ minDistance: 5 });
    });

    test('rejects an invalid _near operator', () => {
      expect(() => spatialCondition('_near', 5)).toThrow('_near expects');
      expect(() =>
        spatialCondition('_near', { point: [1, 2], maxDistance: -1 })
      ).toThrow('maxDistance');
      expect(() =>
        spatialCondition('_near', {
          point: [1, 2],
          maxDistance: 10,
          minDistance: 20
        })
      ).toThrow('minDistance');
    });

    test('normalizes the _within, _withinBox and _intersects operators', () => {
      const polygon = square(0, 0, 1, 1);
      expect(spatialCondition('_within', polygon)).toEqual({
        operator: 'within',
        geometry: polygon
      });
      const multi = {
        type: 'MultiPolygon',
        coordinates: [polygon.coordinates]
      };
      expect(spatialCondition('_within', multi)).toEqual({
        operator: 'within',
        geometry: multi
      });
      expect(spatialCondition('_withinBox', [0, 0, '1', 1])).toEqual({
        operator: 'withinBox',
        box: [0, 0, 1, 1]
      });
      expect(spatialCondition('_intersects', point(1, 1))).toEqual({
        operator: 'intersects',
        geometry: point(1, 1)
      });
    });

    test('rejects the invalid operators', () => {
      expect(() => spatialCondition('_within', point(1, 1))).toThrow('Polygon');
      expect(() => spatialCondition('_withinBox', [1, 0, 0, 1])).toThrow(
        '_withinBox expects'
      );
      expect(() => spatialCondition('_withinBox', 'x')).toThrow(
        '_withinBox expects'
      );
      expect(() => spatialCondition('_withinBox', [0, 0, 200, 1])).toThrow(
        'longitude 200'
      );
      expect(() => spatialCondition('_eq', 1)).toThrow('unknown');
    });
  });

  describe('geometryPositions / geometryBox', () => {
    test('lists every position and bounds them', () => {
      const multi: GeoGeometry = {
        type: 'MultiPolygon',
        coordinates: [
          square(0, 0, 1, 1).coordinates,
          square(5, -3, 6, 2).coordinates
        ]
      };
      expect(geometryPositions(multi)).toHaveLength(10);
      expect(geometryBox(multi)).toEqual([0, -3, 6, 2]);
      expect(geometryBox(point(3, 4))).toEqual([3, 4, 3, 4]);
      expect(
        geometryPositions({
          type: 'MultiLineString',
          coordinates: [
            [
              [0, 0],
              [1, 1]
            ]
          ]
        })
      ).toEqual([
        [0, 0],
        [1, 1]
      ]);
    });
  });

  describe('geoDistance / distanceBox', () => {
    test('measures the great circle distance', () => {
      // A degree of latitude is a 360th of the circumference
      expect(geoDistance([0, 0], [0, 1])).toBeCloseTo(
        (2 * Math.PI * EARTH_RADIUS) / 360,
        3
      );
      expect(geoDistance([15.9819, 45.815], [16.4402, 43.5081])).toBeCloseTo(
        258_928,
        -3
      );
    });

    test('bounds the area within a distance of a point', () => {
      const [minLng, minLat, maxLng, maxLat] = distanceBox([10, 45], 10_000);
      expect(geoDistance([10, 45], [10, maxLat])).toBeCloseTo(10_000, 0);
      expect(geoDistance([10, 45], [10, minLat])).toBeCloseTo(10_000, 0);
      expect(maxLng - 10).toBeCloseTo(10 - minLng, 9);
      expect(geoDistance([10, 45], [maxLng, 45])).toBeGreaterThan(10_000);
    });

    test('covers every longitude near a pole', () => {
      expect(distanceBox([0, 89.99], 10_000)).toEqual([
        -180,
        expect.any(Number),
        180,
        90
      ]);
    });
  });

  describe('geometryDistance', () => {
    test('measures from a point to the nearest point of a geometry', () => {
      expect(geometryDistance(point(0, 1), [0, 0])).toBeCloseTo(
        geoDistance([0, 0], [0, 1]),
        6
      );
      expect(geometryDistance(square(0, 0, 1, 1), [0.5, 0.5])).toBe(0);
      expect(geometryDistance(line([-1, 1], [1, 1]), [0, 0])).toBeCloseTo(
        geoDistance([0, 0], [0, 1]),
        -1
      );
      expect(geometryDistance(line([0, 0], [0, 0]), [0, 1])).toBeCloseTo(
        geoDistance([0, 0], [0, 1]),
        6
      );
    });
  });

  describe('geometryCoveredBy', () => {
    const region = square(0, 0, 10, 10);
    const holed: GeoPolygon = {
      type: 'Polygon',
      coordinates: [...region.coordinates, ...square(4, 4, 6, 6).coordinates]
    };

    test('covers the geometries inside the region or on its boundary', () => {
      expect(geometryCoveredBy(point(5, 5), region)).toBe(true);
      expect(geometryCoveredBy(point(0, 5), region)).toBe(true);
      expect(geometryCoveredBy(square(1, 1, 2, 2), region)).toBe(true);
      expect(geometryCoveredBy(line([1, 1], [9, 9]), region)).toBe(true);
    });

    test('leaves out the geometries reaching outside the region', () => {
      expect(geometryCoveredBy(point(11, 5), region)).toBe(false);
      expect(geometryCoveredBy(line([1, 1], [11, 1]), region)).toBe(false);
      expect(geometryCoveredBy(square(5, 5, 15, 15), region)).toBe(false);
      expect(geometryCoveredBy(point(5, 5), point(5, 5))).toBe(false);
    });

    test('leaves out the geometries reaching into a hole', () => {
      expect(geometryCoveredBy(point(5, 5), holed)).toBe(false);
      expect(geometryCoveredBy(point(2, 2), holed)).toBe(true);
      // A polygon around the hole, its own vertices all inside the region
      expect(geometryCoveredBy(square(3, 3, 7, 7), holed)).toBe(false);
      // An edge crossing the hole
      expect(geometryCoveredBy(line([3, 5], [7, 5]), holed)).toBe(false);
    });

    test('leaves out a line leaving a concave region between its vertices', () => {
      const concave: GeoPolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [5, 2],
            [0, 10],
            [0, 0]
          ]
        ]
      };
      expect(geometryCoveredBy(line([1, 8], [9, 8]), concave)).toBe(false);
    });
  });

  describe('geometryIntersects', () => {
    test('matches the geometries sharing a point', () => {
      const a = square(0, 0, 2, 2);
      expect(geometryIntersects(a, square(1, 1, 3, 3))).toBe(true);
      expect(geometryIntersects(a, square(2, 2, 3, 3))).toBe(true);
      expect(geometryIntersects(a, square(0.5, 0.5, 1, 1))).toBe(true);
      expect(geometryIntersects(square(-1, -1, 3, 3), a)).toBe(true);
      expect(geometryIntersects(a, point(1, 1))).toBe(true);
      expect(geometryIntersects(point(1, 1), point(1, 1))).toBe(true);
      expect(geometryIntersects(line([-1, 1], [3, 1]), a)).toBe(true);
      expect(
        geometryIntersects(line([0, 0], [2, 2]), line([0, 2], [2, 0]))
      ).toBe(true);
      expect(
        geometryIntersects(line([0, 0], [2, 0]), line([1, 0], [3, 0]))
      ).toBe(true);
      expect(geometryIntersects(line([0, 0], [2, 0]), point(1, 0))).toBe(true);
    });

    test('leaves out the disjoint geometries', () => {
      const a = square(0, 0, 2, 2);
      expect(geometryIntersects(a, square(3, 3, 4, 4))).toBe(false);
      expect(geometryIntersects(point(1, 1), point(1, 2))).toBe(false);
      expect(
        geometryIntersects(line([0, 0], [2, 0]), line([0, 1], [2, 1]))
      ).toBe(false);
      expect(
        geometryIntersects(line([0, 0], [1, 0]), line([2, 0], [3, 0]))
      ).toBe(false);
      expect(
        geometryIntersects(line([0, 0], [1, 1]), line([2, 0], [2, 2]))
      ).toBe(false);
      // Inside a hole
      const holed: GeoPolygon = {
        type: 'Polygon',
        coordinates: [
          ...square(0, 0, 10, 10).coordinates,
          ...square(4, 4, 6, 6).coordinates
        ]
      };
      expect(geometryIntersects(point(5, 5), holed)).toBe(false);
    });
  });

  describe('matchSpatialCondition / conditionBox', () => {
    test('returns the distance of a near match', () => {
      const near = spatialCondition('_near', {
        point: [0, 0],
        maxDistance: 200_000
      });
      expect(matchSpatialCondition(point(0, 1), near)).toBeCloseTo(
        geoDistance([0, 0], [0, 1]),
        6
      );
      expect(matchSpatialCondition(point(0, 2), near)).toBe(false);
      expect(
        matchSpatialCondition(
          point(0, 0.1),
          spatialCondition('_near', {
            point: [0, 0],
            maxDistance: 200_000,
            minDistance: 50_000
          })
        )
      ).toBe(false);
      expect(conditionBox(near)).toEqual(distanceBox([0, 0], 200_000));
    });

    test('matches the within, withinBox and intersects conditions', () => {
      const within = spatialCondition('_within', square(0, 0, 2, 2));
      expect(matchSpatialCondition(point(1, 1), within)).toBe(true);
      expect(conditionBox(within)).toEqual([0, 0, 2, 2]);

      const box = spatialCondition('_withinBox', [0, 0, 2, 2]);
      expect(matchSpatialCondition(point(3, 1), box)).toBe(false);
      expect(conditionBox(box)).toEqual([0, 0, 2, 2]);

      const intersects = spatialCondition('_intersects', line([0, 0], [4, 4]));
      expect(matchSpatialCondition(square(1, 0, 2, 3), intersects)).toBe(true);
      expect(conditionBox(intersects)).toEqual([0, 0, 4, 4]);
    });
  });
});
