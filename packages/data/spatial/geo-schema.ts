import { TSchema, Type } from '@sinclair/typebox';
import {
  GEO_FIELD_GEOMETRIES,
  GeoField,
  GeoGeometryType,
  Nullable,
  pickProperties
} from '@appweaver/common';

/** A position `[lng, lat]` in WGS 84 degrees. */
export const GeoPositionSchema = (): TSchema =>
  Type.Tuple(
    [
      Type.Number({ minimum: -180, maximum: 180 }),
      Type.Number({ minimum: -90, maximum: 90 })
    ],
    { description: 'A position [lng, lat] in WGS 84 degrees' }
  );

/** A point given by its latitude and longitude. */
export const GeoLatLngSchema = (): TSchema =>
  Type.Object(
    {
      lat: Type.Number({ minimum: -90, maximum: 90 }),
      lng: Type.Number({ minimum: -180, maximum: 180 })
    },
    { description: 'A point given by its latitude and longitude' }
  );

const ring = () => Type.Array(GeoPositionSchema(), { minItems: 4 });
const polygonCoordinates = () => Type.Array(ring(), { minItems: 1 });

const COORDINATES: Record<GeoGeometryType, () => TSchema> = {
  Point: GeoPositionSchema,
  MultiPoint: () => Type.Array(GeoPositionSchema(), { minItems: 1 }),
  LineString: () => Type.Array(GeoPositionSchema(), { minItems: 2 }),
  MultiLineString: () =>
    Type.Array(Type.Array(GeoPositionSchema(), { minItems: 2 }), {
      minItems: 1
    }),
  Polygon: polygonCoordinates,
  MultiPolygon: () => Type.Array(polygonCoordinates(), { minItems: 1 })
};

/**
 * The schema of a GeoJSON geometry of a type.
 *
 * @param {GeoGeometryType} type - The GeoJSON type, i.e. `Point`.
 * @return {TSchema} The schema.
 */
export function geometrySchema(type: GeoGeometryType): TSchema {
  return Type.Object(
    { type: Type.Literal(type), coordinates: COORDINATES[type]() },
    { description: `A GeoJSON ${type}` }
  );
}

/**
 * The schema of the value of a geo field: a GeoJSON geometry of one of the types of the field, and for the input of a
 * field holding points, a `{ lat, lng }` object too. A field with `required: false` is nullable.
 *
 * @param {GeoField} field - The geo field.
 * @param {boolean} [input=false] - Whether the schema validates an input.
 * @return {TSchema} The schema.
 */
export function geoFieldSchema(
  field: GeoField,
  input: boolean = false
): TSchema {
  const types =
    GEO_FIELD_GEOMETRIES[field.type] ?? GEO_FIELD_GEOMETRIES.geometry;
  const branches = types.map(geometrySchema);
  if (input && types.includes('Point')) {
    branches.push(GeoLatLngSchema());
  }

  const options = pickProperties(field, ['hidden', 'description', 'example']);
  const schema =
    branches.length === 1
      ? { ...branches[0], ...options }
      : Type.Union(branches, options);

  return field.required === false ? Nullable(schema) : schema;
}
