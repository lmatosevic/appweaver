/** A position of a GeoJSON geometry, its longitude then its latitude in degrees (WGS 84). */
export type GeoPosition = [lng: number, lat: number];

/** A point given by its latitude and longitude, accepted by the point fields in place of a GeoJSON point. */
export type GeoLatLng = {
  lat: number;
  lng: number;
};

export type GeoPoint = {
  type: 'Point';
  coordinates: GeoPosition;
};

export type GeoMultiPoint = {
  type: 'MultiPoint';
  coordinates: GeoPosition[];
};

export type GeoLineString = {
  type: 'LineString';
  coordinates: GeoPosition[];
};

export type GeoMultiLineString = {
  type: 'MultiLineString';
  coordinates: GeoPosition[][];
};

/** A polygon: its exterior ring, then its holes, each ring closed (its last position equal to its first one). */
export type GeoPolygon = {
  type: 'Polygon';
  coordinates: GeoPosition[][];
};

export type GeoMultiPolygon = {
  type: 'MultiPolygon';
  coordinates: GeoPosition[][][];
};

/** A GeoJSON geometry (RFC 7946) in WGS 84 longitude and latitude. */
export type GeoGeometry =
  | GeoPoint
  | GeoMultiPoint
  | GeoLineString
  | GeoMultiLineString
  | GeoPolygon
  | GeoMultiPolygon;

/** The GeoJSON type of a geometry, i.e. `Point`. */
export type GeoGeometryType = GeoGeometry['type'];

/** The type of a geo field, `geometry` holding any of the others. */
export type GeoFieldType =
  | 'point'
  | 'multiPoint'
  | 'lineString'
  | 'multiLineString'
  | 'polygon'
  | 'multiPolygon'
  | 'geometry';

/** A bounding box: `[minLng, minLat, maxLng, maxLat]`. */
export type GeoBox = [
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
];

/** The condition of the `_near` operator, distances in meters. */
export type GeoNear = {
  /** The point the distance is measured from */
  point: GeoPosition | GeoLatLng | GeoPoint;
  /** The maximum distance in meters */
  maxDistance: number;
  /** The minimum distance in meters */
  minDistance?: number;
};

/** The operators of a geo field in a query filter. */
export type GeoFilterOperators = {
  /** Matches geometries within a distance of a point, in meters */
  _near?: GeoNear;
  /** Matches geometries covered by a polygon or a multi polygon */
  _within?: GeoPolygon | GeoMultiPolygon;
  /** Matches geometries covered by a bounding box `[minLng, minLat, maxLng, maxLat]` */
  _withinBox?: GeoBox;
  /** Matches geometries sharing at least a point with a geometry */
  _intersects?: GeoGeometry;
  /** Matches records with a value (`true`) or without one (`false`) */
  _exists?: boolean;
};

/** A spatial condition of a query, normalized from the operators of a geo field. */
export type SpatialCondition =
  | {
      operator: 'near';
      point: GeoPosition;
      maxDistance: number;
      minDistance?: number;
    }
  | { operator: 'within'; geometry: GeoPolygon | GeoMultiPolygon }
  | { operator: 'withinBox'; box: GeoBox }
  | { operator: 'intersects'; geometry: GeoGeometry };

/** A record matching a spatial condition, with its distance in meters for a `near` condition. */
export type SpatialMatch<I = unknown> = {
  id: I;
  distance?: number;
};
