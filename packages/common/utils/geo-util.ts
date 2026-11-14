import {
  GeoBox,
  GeoFieldType,
  GeoGeometry,
  GeoGeometryType,
  GeoMultiPolygon,
  GeoPolygon,
  GeoPosition,
  SpatialCondition
} from '../types/geo';
import { ResourceModelConfig } from '../types/model';
import { isArray, isPlainObject } from './type-util';

/** The mean radius of the Earth in meters, the one of the spherical distances of PostGIS. */
export const EARTH_RADIUS = 6_371_008.8;

/** The GeoJSON types a geo field accepts. */
export const GEO_FIELD_GEOMETRIES: Record<GeoFieldType, GeoGeometryType[]> = {
  point: ['Point'],
  multiPoint: ['MultiPoint'],
  lineString: ['LineString'],
  multiLineString: ['MultiLineString'],
  polygon: ['Polygon'],
  multiPolygon: ['MultiPolygon'],
  geometry: [
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon'
  ]
};

/** Checks and normalizes the coordinates of each GeoJSON type. */
const COORDINATES: Record<GeoGeometryType, (value: unknown) => unknown> = {
  Point: (value) => position(value),
  MultiPoint: (value) => positions(value, 1),
  LineString: (value) => positions(value, 2),
  MultiLineString: (value) => list(value, 1).map((line) => positions(line, 2)),
  Polygon: (value) => polygon(value),
  MultiPolygon: (value) => list(value, 1).map(polygon)
};

/** The columns a geo field keeps beside its GeoJSON column: its bounding box, and its PostGIS geometry. */
export type GeoColumns = {
  minLng: string;
  minLat: string;
  maxLng: string;
  maxLat: string;
  geom: string;
};

/** The parts of a geometry the spatial predicates work on. */
type GeometryParts = {
  points: GeoPosition[];
  /** The line strings and the rings of the polygons */
  lines: GeoPosition[][];
  polygons: GeoPosition[][][];
};

/**
 * The names of the columns a geo field keeps beside its GeoJSON column, i.e. `locationMinLng` and `locationGeom`.
 *
 * @param {string} field - The geo field name.
 * @return {GeoColumns} The column names.
 */
export function geoColumns(field: string): GeoColumns {
  return {
    minLng: `${field}MinLng`,
    minLat: `${field}MinLat`,
    maxLng: `${field}MaxLng`,
    maxLat: `${field}MaxLat`,
    geom: `${field}Geom`
  };
}

/**
 * Checks and normalizes a geo field value into a GeoJSON geometry of the type of the field. A point field (and a
 * `geometry` one) also takes a `{ lat, lng }` object. The positions keep their longitude and latitude only.
 *
 * @param {unknown} value - The value to normalize.
 * @param {GeoFieldType} [type='geometry'] - The type of the field.
 * @param {number} [maxVertices=Infinity] - The maximum number of positions of the geometry.
 * @return {GeoGeometry} The normalized geometry.
 * @throws {Error} With the reason the value is not a valid geometry of the field.
 */
export function normalizeGeometry(
  value: unknown,
  type: GeoFieldType = 'geometry',
  maxVertices: number = Infinity
): GeoGeometry {
  const allowed = GEO_FIELD_GEOMETRIES[type] ?? GEO_FIELD_GEOMETRIES.geometry;

  if (isLatLng(value) && allowed.includes('Point')) {
    return { type: 'Point', coordinates: position([value.lng, value.lat]) };
  }
  if (!isPlainObject(value) || typeof value.type !== 'string') {
    throw new Error(
      `expected a GeoJSON ${allowed.join(' or ')}${allowed.includes('Point') ? ' or a { lat, lng } object' : ''}`
    );
  }

  const geometryType = value.type as GeoGeometryType;
  if (!allowed.includes(geometryType)) {
    throw new Error(
      `expected a GeoJSON ${allowed.join(' or ')}, not a ${geometryType}`
    );
  }

  const geometry = {
    type: geometryType,
    coordinates: COORDINATES[geometryType](value.coordinates)
  } as GeoGeometry;

  const count = geometryPositions(geometry).length;
  if (count > maxVertices) {
    throw new Error(
      `the geometry has ${count} positions, more than ${maxVertices}`
    );
  }
  return geometry;
}

/**
 * The name of the field holding the distance of a geo field from the point of its `_near` filter, i.e.
 * `locationDistance`.
 *
 * @param {string} field - The geo field name.
 * @return {string} The distance field name.
 */
export function distanceFieldName(field: string): string {
  return `${field}Distance`;
}

/**
 * Normalizes the operator of a geo field filter into its spatial condition.
 *
 * @param {string} operator - The operator, `_near`, `_within` or `_intersects`.
 * @param {unknown} value - The value of the operator.
 * @param {number} [maxVertices=Infinity] - The maximum number of positions of a geometry of the condition.
 * @return {SpatialCondition} The condition.
 * @throws {Error} With the reason the value is not valid for the operator.
 */
export function spatialCondition(
  operator: string,
  value: unknown,
  maxVertices: number = Infinity
): SpatialCondition {
  switch (operator) {
    case '_near': {
      if (!isPlainObject(value)) {
        throw new Error('_near expects { point, maxDistance, minDistance? }');
      }
      const point = isArray(value.point)
        ? position(value.point)
        : (
            normalizeGeometry(value.point, 'point') as {
              coordinates: GeoPosition;
            }
          ).coordinates;
      const maxDistance = Number(value.maxDistance);
      const minDistance =
        value.minDistance === undefined ? undefined : Number(value.minDistance);
      if (!Number.isFinite(maxDistance) || maxDistance < 0) {
        throw new Error('_near expects a maxDistance of 0 or more meters');
      }
      if (
        minDistance !== undefined &&
        (!Number.isFinite(minDistance) ||
          minDistance < 0 ||
          minDistance > maxDistance)
      ) {
        throw new Error(
          '_near expects a minDistance between 0 and its maxDistance'
        );
      }
      return { operator: 'near', point, maxDistance, minDistance };
    }
    case '_within': {
      const type =
        isPlainObject(value) && value.type === 'MultiPolygon'
          ? 'multiPolygon'
          : 'polygon';
      return {
        operator: 'within',
        geometry: normalizeGeometry(value, type, maxVertices) as
          | GeoPolygon
          | GeoMultiPolygon
      };
    }
    case '_intersects':
      return {
        operator: 'intersects',
        geometry: normalizeGeometry(value, 'geometry', maxVertices)
      };
    default:
      throw new Error(`unknown spatial operator ${operator}`);
  }
}

/**
 * Checks the bounding box of a `_withinBox` operator, and splits a box crossing the antimeridian (its `minLng` above
 * its `maxLng`) into the two boxes on its sides.
 *
 * @param {unknown} value - The `[minLng, minLat, maxLng, maxLat]` box.
 * @return {GeoBox[]} The box, or its two parts.
 * @throws {Error} With the reason the value is not a bounding box.
 */
export function normalizeBox(value: unknown): GeoBox[] {
  const box = isArray(value) ? value.map(Number) : [];
  if (box.length !== 4 || !box.every(Number.isFinite) || box[1] > box[3]) {
    throw new Error(
      '_withinBox expects [minLng, minLat, maxLng, maxLat] with its minLat not above its maxLat'
    );
  }
  const [minLng, minLat] = position([box[0], box[1]]);
  const [maxLng, maxLat] = position([box[2], box[3]]);
  return minLng > maxLng
    ? [
        [minLng, minLat, 180, maxLat],
        [-180, minLat, maxLng, maxLat]
      ]
    : [[minLng, minLat, maxLng, maxLat]];
}

/**
 * The positions of a geometry, the ones of every ring of its polygons included.
 *
 * @param {GeoGeometry} geometry - The geometry.
 * @return {GeoPosition[]} The positions.
 */
export function geometryPositions(geometry: GeoGeometry): GeoPosition[] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];
    case 'MultiPoint':
    case 'LineString':
      return geometry.coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates.flat();
    case 'MultiPolygon':
      return geometry.coordinates.flat(2);
  }
}

/**
 * The bounding box of a geometry.
 *
 * @param {GeoGeometry} geometry - The geometry.
 * @return {GeoBox} Its `[minLng, minLat, maxLng, maxLat]`.
 */
export function geometryBox(geometry: GeoGeometry): GeoBox {
  const box: GeoBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of geometryPositions(geometry)) {
    box[0] = Math.min(box[0], lng);
    box[1] = Math.min(box[1], lat);
    box[2] = Math.max(box[2], lng);
    box[3] = Math.max(box[3], lat);
  }
  return box;
}

/**
 * The polygon of a bounding box.
 *
 * @param {GeoBox} box - The `[minLng, minLat, maxLng, maxLat]` box.
 * @return {GeoPolygon} The polygon.
 */
export function boxPolygon([
  minLng,
  minLat,
  maxLng,
  maxLat
]: GeoBox): GeoPolygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat]
      ]
    ]
  };
}

/**
 * The bounding boxes of the area within a distance of a point: one box, covering every longitude near a pole, or the
 * two boxes on the sides of the antimeridian for an area crossing it.
 *
 * @param {GeoPosition} point - The point.
 * @param {number} distance - The distance in meters.
 * @return {GeoBox[]} The boxes.
 */
export function distanceBoxes(
  [lng, lat]: GeoPosition,
  distance: number
): GeoBox[] {
  const latDelta = toDegrees(distance / EARTH_RADIUS);
  const minLat = Math.max(-90, lat - latDelta);
  const maxLat = Math.min(90, lat + latDelta);
  const cos = Math.cos(toRadians(Math.max(Math.abs(minLat), Math.abs(maxLat))));
  const lngDelta = cos > 1e-12 ? latDelta / cos : 360;
  if (lngDelta >= 180) {
    return [[-180, minLat, 180, maxLat]];
  }

  const [minLng, maxLng] = [lng - lngDelta, lng + lngDelta];
  if (minLng < -180) {
    return [
      [minLng + 360, minLat, 180, maxLat],
      [-180, minLat, maxLng, maxLat]
    ];
  }
  if (maxLng > 180) {
    return [
      [minLng, minLat, 180, maxLat],
      [-180, minLat, maxLng - 360, maxLat]
    ];
  }
  return [[minLng, minLat, maxLng, maxLat]];
}

/**
 * The great circle distance between two positions on a sphere of the mean radius of the Earth (haversine).
 *
 * @param {GeoPosition} a - The first position.
 * @param {GeoPosition} b - The second position.
 * @return {number} The distance in meters.
 */
export function geoDistance(a: GeoPosition, b: GeoPosition): number {
  const dLat = toRadians(b[1] - a[1]);
  const dLng = toRadians(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a[1])) *
      Math.cos(toRadians(b[1])) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The distance from a point to the nearest point of a geometry, `0` inside a polygon. The distance to a point is the
 * great circle one, the distance to a segment is measured on a plane tangent at the point, close to the great circle
 * one over the distances of a city. A geometry crossing the antimeridian is not supported.
 *
 * @param {GeoGeometry} geometry - The geometry.
 * @param {GeoPosition} point - The point.
 * @return {number} The distance in meters.
 */
export function geometryDistance(
  geometry: GeoGeometry,
  point: GeoPosition
): number {
  const parts = geometryParts(geometry);
  if (parts.polygons.some((polygon) => inPolygon(point, polygon))) {
    return 0;
  }

  let distance = Infinity;
  for (const position of parts.points) {
    distance = Math.min(distance, geoDistance(point, position));
  }
  for (const line of parts.lines) {
    for (let i = 1; i < line.length; i++) {
      distance = Math.min(
        distance,
        segmentDistance(point, line[i - 1], line[i])
      );
    }
  }
  return distance;
}

/**
 * Checks if a geometry is covered by another one: every point of it lies inside or on the boundary of a polygon of
 * the other one. Longitude and latitude are taken as planar coordinates, like the `geometry` type of PostGIS.
 *
 * @param {GeoGeometry} geometry - The geometry.
 * @param {GeoGeometry} region - The region, a polygon or a multi polygon.
 * @return {boolean} `true` when the region covers the geometry.
 */
export function geometryCoveredBy(
  geometry: GeoGeometry,
  region: GeoGeometry
): boolean {
  const regionParts = geometryParts(region);
  if (regionParts.polygons.length === 0) {
    return false;
  }
  const covered = (p: GeoPosition) =>
    regionParts.polygons.some((polygon) => inPolygon(p, polygon));

  const parts = geometryParts(geometry);
  if (!parts.points.every(covered)) {
    return false;
  }

  for (const line of parts.lines) {
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      if (!covered([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) {
        return false;
      }
      for (const ring of regionParts.lines) {
        for (let j = 1; j < ring.length; j++) {
          if (segmentsCross(a, b, ring[j - 1], ring[j])) {
            return false;
          }
        }
      }
    }
  }

  // A hole of the region inside a polygon of the geometry is not covered
  for (const polygon of parts.polygons) {
    for (const regionPolygon of regionParts.polygons) {
      for (const hole of regionPolygon.slice(1)) {
        if (hole.some((p) => inPolygon(p, polygon, false))) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Checks if two geometries share at least a point, a boundary included. Longitude and latitude are taken as planar
 * coordinates, like the `geometry` type of PostGIS.
 *
 * @param {GeoGeometry} a - The first geometry.
 * @param {GeoGeometry} b - The second geometry.
 * @return {boolean} `true` when the geometries intersect.
 */
export function geometryIntersects(a: GeoGeometry, b: GeoGeometry): boolean {
  const partsA = geometryParts(a);
  const partsB = geometryParts(b);

  const inside = (points: GeoPosition[], polygons: GeoPosition[][][]) =>
    points.some((p) => polygons.some((polygon) => inPolygon(p, polygon)));
  if (
    inside(partsA.points, partsB.polygons) ||
    inside(partsB.points, partsA.polygons)
  ) {
    return true;
  }

  const segments = (parts: GeometryParts): [GeoPosition, GeoPosition][] => [
    ...parts.lines.flatMap((line) =>
      line.slice(1).map((p, i): [GeoPosition, GeoPosition] => [line[i], p])
    ),
    ...(parts.lines.length === 0
      ? parts.points.map((p): [GeoPosition, GeoPosition] => [p, p])
      : [])
  ];
  const segmentsB = segments(partsB);
  return segments(partsA).some(([p1, p2]) =>
    segmentsB.some(([q1, q2]) => segmentsIntersect(p1, p2, q1, q2))
  );
}

/**
 * Checks if a geometry matches a spatial condition.
 *
 * @param {GeoGeometry} geometry - The geometry.
 * @param {SpatialCondition} condition - The condition.
 * @return {number | boolean} The distance in meters of a matching geometry for a `near` condition, `true` for a
 * matching one of the other conditions, `false` when it does not match.
 */
export function matchSpatialCondition(
  geometry: GeoGeometry,
  condition: SpatialCondition
): number | boolean {
  switch (condition.operator) {
    case 'near': {
      const distance = geometryDistance(geometry, condition.point);
      return distance <= condition.maxDistance &&
        distance >= (condition.minDistance ?? 0)
        ? distance
        : false;
    }
    case 'within':
      return geometryCoveredBy(geometry, condition.geometry);
    case 'intersects':
      return geometryIntersects(geometry, condition.geometry);
  }
}

/**
 * The bounding boxes a geometry matching a spatial condition lies in (`within`) or overlaps (`near`, `intersects`):
 * one box, or two for a `near` condition crossing the antimeridian.
 *
 * @param {SpatialCondition} condition - The condition.
 * @return {GeoBox[]} The boxes.
 */
export function conditionBoxes(condition: SpatialCondition): GeoBox[] {
  return condition.operator === 'near'
    ? distanceBoxes(condition.point, condition.maxDistance)
    : [geometryBox(condition.geometry)];
}

function isLatLng(value: unknown): value is { lat: number; lng: number } {
  return (
    isPlainObject(value) &&
    value.type === undefined &&
    value.lat !== undefined &&
    value.lng !== undefined
  );
}

function list(value: unknown, minItems: number): any[] {
  if (!isArray(value) || value.length < minItems) {
    throw new Error(`expected a list of at least ${minItems} coordinates`);
  }
  return value;
}

function position(value: unknown): GeoPosition {
  if (!isArray(value) || value.length < 2) {
    throw new Error('expected a position [lng, lat]');
  }
  const [lng, lat] = [Number(value[0]), Number(value[1])];
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error(`longitude ${value[0]} is not between -180 and 180`);
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error(`latitude ${value[1]} is not between -90 and 90`);
  }
  return [lng, lat];
}

function positions(value: unknown, minItems: number): GeoPosition[] {
  return list(value, minItems).map(position);
}

function polygon(value: unknown): GeoPosition[][] {
  return list(value, 1).map((ringValue) => {
    const ring = positions(ringValue, 4);
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      throw new Error('a polygon ring must end with its first position');
    }
    return ring;
  });
}

function geometryParts(geometry: GeoGeometry): GeometryParts {
  switch (geometry.type) {
    case 'Point':
      return { points: [geometry.coordinates], lines: [], polygons: [] };
    case 'MultiPoint':
      return { points: geometry.coordinates, lines: [], polygons: [] };
    case 'LineString':
      return {
        points: geometry.coordinates,
        lines: [geometry.coordinates],
        polygons: []
      };
    case 'MultiLineString':
      return {
        points: geometry.coordinates.flat(),
        lines: geometry.coordinates,
        polygons: []
      };
    case 'Polygon':
      return {
        points: geometry.coordinates.flat(),
        lines: geometry.coordinates,
        polygons: [geometry.coordinates]
      };
    case 'MultiPolygon':
      return {
        points: geometry.coordinates.flat(2),
        lines: geometry.coordinates.flat(),
        polygons: geometry.coordinates
      };
  }
}

/** Whether a point is inside a polygon, outside its holes, its boundary counting as inside unless excluded. */
function inPolygon(
  point: GeoPosition,
  rings: GeoPosition[][],
  boundary: boolean = true
): boolean {
  const [exterior, ...holes] = rings;
  const onBoundary = rings.some((ring) => onRing(point, ring));
  if (onBoundary) {
    return boundary;
  }
  return inRing(point, exterior) && !holes.some((hole) => inRing(point, hole));
}

/** Whether a point is strictly inside a ring (ray casting). */
function inRing([x, y]: GeoPosition, ring: GeoPosition[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function onRing(point: GeoPosition, ring: GeoPosition[]): boolean {
  for (let i = 1; i < ring.length; i++) {
    if (
      orientation(ring[i - 1], ring[i], point) === 0 &&
      onSegment(ring[i - 1], ring[i], point)
    ) {
      return true;
    }
  }
  return false;
}

/** The sign of the cross product of `pq` and `pr`: 0 when collinear. */
function orientation(p: GeoPosition, q: GeoPosition, r: GeoPosition): number {
  const value = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return Math.abs(value) < 1e-12 ? 0 : Math.sign(value);
}

/** Whether a point collinear with a segment lies within its bounds. */
function onSegment(p: GeoPosition, q: GeoPosition, r: GeoPosition): boolean {
  return (
    Math.min(p[0], q[0]) - 1e-12 <= r[0] &&
    r[0] <= Math.max(p[0], q[0]) + 1e-12 &&
    Math.min(p[1], q[1]) - 1e-12 <= r[1] &&
    r[1] <= Math.max(p[1], q[1]) + 1e-12
  );
}

/** Whether two segments share a point, an end or a touch included. */
function segmentsIntersect(
  p1: GeoPosition,
  p2: GeoPosition,
  q1: GeoPosition,
  q2: GeoPosition
): boolean {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }
  return (
    (o1 === 0 && onSegment(p1, p2, q1)) ||
    (o2 === 0 && onSegment(p1, p2, q2)) ||
    (o3 === 0 && onSegment(q1, q2, p1)) ||
    (o4 === 0 && onSegment(q1, q2, p2))
  );
}

/** Whether two segments cross at a point inside both of them, a touch excluded. */
function segmentsCross(
  p1: GeoPosition,
  p2: GeoPosition,
  q1: GeoPosition,
  q2: GeoPosition
): boolean {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** The distance from a point to a segment on the plane tangent at the point, in meters. */
function segmentDistance(
  point: GeoPosition,
  a: GeoPosition,
  b: GeoPosition
): number {
  const cos = Math.cos(toRadians(point[1]));
  // The shorter way around, for a segment on the other side of the antimeridian
  const project = ([lng, lat]: GeoPosition): [number, number] => [
    toRadians(((lng - point[0] + 540) % 360) - 180) * cos * EARTH_RADIUS,
    toRadians(lat - point[1]) * EARTH_RADIUS
  ];
  const [ax, ay] = project(a);
  const [bx, by] = project(b);
  const [dx, dy] = [bx - ax, by - ay];
  const length = dx * dx + dy * dy;
  if (length === 0) {
    return geoDistance(point, a);
  }
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
  const nearest: GeoPosition = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t
  ];
  return geoDistance(point, nearest);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Checks if a model declares geo fields.
 *
 * @param {ResourceModelConfig} [config] - The model config.
 * @return {boolean} `true` when the model has at least one `geo` field.
 */
export function hasGeo(config?: ResourceModelConfig): boolean {
  return Object.keys(config?.geo ?? {}).length > 0;
}
