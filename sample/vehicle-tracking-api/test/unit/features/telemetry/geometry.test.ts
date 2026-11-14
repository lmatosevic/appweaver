import { geoDistance, GeoPosition } from '@appweaver/common';
import {
  bearing,
  extendPath,
  interpolateLine,
  lineLength,
  MAX_PATH_VERTICES,
  MIN_VERTEX_METERS
} from '@/features/telemetry/geometry';

// About 111 m apart, along a meridian
const a: GeoPosition = [16, 45];
const b: GeoPosition = [16, 45.001];
const c: GeoPosition = [16, 45.002];

describe('lineLength', () => {
  test('sums the segments of the line', () => {
    expect(lineLength([a, b, c])).toBeCloseTo(geoDistance(a, c), 3);
  });

  test('is 0 for a single position', () => {
    expect(lineLength([a])).toBe(0);
  });
});

describe('extendPath', () => {
  test('starts the path with the first position', () => {
    expect(extendPath([], a)).toEqual({ vertices: [a], added: 0 });
  });

  test('adds a position and its distance', () => {
    const { vertices, added } = extendPath([a], b);

    expect(vertices).toEqual([a, b]);
    expect(added).toBeCloseTo(geoDistance(a, b));
  });

  test('ignores a position closer than the minimum to the last vertex', () => {
    const near: GeoPosition = [16, 45 + MIN_VERTEX_METERS / 2 / 111_195];

    expect(extendPath([a], near)).toEqual({ vertices: [a], added: 0 });
  });

  test('moves the last vertex of a full path, still counting the distance', () => {
    const full = Array.from(
      { length: MAX_PATH_VERTICES },
      (_, i): GeoPosition => [16, 45 + i * 0.001]
    );
    const next: GeoPosition = [16.001, 45 + (MAX_PATH_VERTICES - 1) * 0.001];

    const { vertices, added } = extendPath(full, next);

    expect(vertices).toHaveLength(MAX_PATH_VERTICES);
    expect(vertices.at(-1)).toEqual(next);
    expect(added).toBeCloseTo(geoDistance(full.at(-1)!, next));
  });
});

describe('bearing', () => {
  test('is 0 to the north and 90 to the east', () => {
    expect(bearing(a, b)).toBeCloseTo(0);
    expect(bearing([16, 45], [16.001, 45])).toBeCloseTo(90, 1);
  });

  test('is 180 to the south', () => {
    expect(bearing(b, a)).toBeCloseTo(180);
  });
});

describe('interpolateLine', () => {
  test('places the positions a step apart, ending at the last one', () => {
    const positions = interpolateLine([a, c], 50);

    expect(positions[0]).toEqual(a);
    expect(positions.at(-1)).toEqual(c);
    for (let i = 1; i < positions.length - 1; i++) {
      expect(geoDistance(positions[i - 1], positions[i])).toBeCloseTo(50, 0);
    }
  });

  test('carries the step over the corners of the line', () => {
    const corner: GeoPosition = [16.003, 45.001];
    const positions = interpolateLine([a, b, corner], 100);

    // 100 m along the first segment, then 200 m along the line, past its corner
    expect(geoDistance(a, positions[1])).toBeCloseTo(100, 0);
    expect(geoDistance(b, positions[2])).toBeCloseTo(
      200 - geoDistance(a, b),
      0
    );
    expect(positions.at(-1)).toEqual(corner);
  });

  test('is empty for an empty line', () => {
    expect(interpolateLine([], 10)).toEqual([]);
  });
});
