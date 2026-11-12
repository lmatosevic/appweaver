import { DbNull } from '@prisma/client/runtime/client';
import {
  ErrorCode,
  geoColumns,
  GeoConfig,
  geometryBox,
  normalizeGeometry,
  SpatialError
} from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import { mapResultRecords, mapWriteArgs } from '../utils/write-data-util';
import { spatialConfig } from './spatial-config';

// The operations whose result holds no records
const COUNT_OPERATIONS = new Set([
  'count',
  'aggregate',
  'groupBy',
  'createMany',
  'updateMany',
  'deleteMany'
]);

/**
 * Creates the Prisma client extension of the geo fields. Every write checks the values of the geo fields and
 * normalizes them into GeoJSON geometries (a `{ lat, lng }` object into a point), storing a null as the database null
 * of a JSON column, and writes the bounding box columns of each geo field, which are left out of the results. The
 * PostGIS geometry columns of the `postgis` provider are written by a trigger of the database (see
 * `PostgisSpatialEngine`).
 *
 * @return {Object} The Prisma client extension.
 */
export function spatialExtension(): any {
  const normalizeRecord = (
    modelName: string,
    data: Record<string, any>
  ): Record<string, any> => {
    const geoFields = geoFieldsOf(modelName);
    if (!geoFields) {
      return data;
    }

    const normalized: Record<string, any> = { ...data };
    for (const [field, geo] of Object.entries(geoFields)) {
      const value = data[field];
      if (value === undefined) {
        continue;
      }

      const geometry = isNullValue(value)
        ? null
        : normalizeValue(modelName, field, value, geo.type);
      normalized[field] = geometry ?? DbNull;

      const columns = geoColumns(field);
      const box = geometry ? geometryBox(geometry) : [null, null, null, null];
      normalized[columns.minLng] = box[0];
      normalized[columns.minLat] = box[1];
      normalized[columns.maxLng] = box[2];
      normalized[columns.maxLat] = box[3];
    }
    return normalized;
  };

  const stripRecord = (
    modelName: string,
    record: Record<string, any>
  ): Record<string, any> => {
    const geoFields = geoFieldsOf(modelName);
    for (const field of Object.keys(geoFields ?? {})) {
      const columns = geoColumns(field);
      delete record[columns.minLng];
      delete record[columns.minLat];
      delete record[columns.maxLng];
      delete record[columns.maxLat];
    }
    return record;
  };

  return {
    name: 'appweaver-spatial',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          const result = await query(
            mapWriteArgs(model, operation, args, normalizeRecord)
          );
          return COUNT_OPERATIONS.has(operation)
            ? result
            : mapResultRecords(model, result, stripRecord);
        }
      }
    }
  };
}

/**
 * Normalizes the value of a geo field, see `normalizeGeometry`.
 *
 * @throws {SpatialError} `SPATIAL_INVALID_GEOMETRY` for a value that is not a geometry of the field.
 */
function normalizeValue(
  modelName: string,
  field: string,
  value: unknown,
  type: GeoConfig[string]['type']
) {
  try {
    return normalizeGeometry(value, type, spatialConfig.MAX_VERTICES);
  } catch (error) {
    const reason = (error as Error).message;
    throw new SpatialError(
      ErrorCode.SpatialInvalidGeometry,
      `Invalid geometry of ${modelName}.${field}: ${reason}`,
      { model: modelName, field, reason }
    );
  }
}

/** Whether a value stores a null: `null`, or one of the null sentinels of Prisma. */
function isNullValue(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === 'object' &&
      /^(Db|Json|Any)Null(Class)?$/.test(value.constructor?.name ?? ''))
  );
}

/** The geo fields of a loaded model. */
function geoFieldsOf(modelName: string): GeoConfig | undefined {
  return context.resource.models.get(modelName)?.config.geo;
}
