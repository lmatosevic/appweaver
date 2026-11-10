import { DbNull } from '@prisma/client/runtime/client';
import {
  capitalize,
  ErrorCode,
  geoColumns,
  GeoConfig,
  geometryBox,
  isResourceAuthModel,
  normalizeGeometry,
  ResourceModel,
  SpatialError
} from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import {
  mapResultRecords,
  mapWriteArgs
} from '../database/utils/write-data-util';
import { spatialConfig, spatialProvider } from './spatial-config';

/** What the extension knows of the models, derived from the loaded resources. */
type SpatialSchema = {
  /** The geo fields of every model declaring some */
  geoFields: Map<string, GeoConfig>;
  /** The related model of every relation, file and audit field of every model */
  relatedModels: Map<string, Map<string, string>>;
};

// The operations whose result holds no records
const COUNT_OPERATIONS = new Set([
  'count',
  'aggregate',
  'groupBy',
  'createMany',
  'updateMany',
  'deleteMany'
]);

let cached: { models: ResourceModel[]; schema: SpatialSchema } | undefined;

/**
 * Creates the Prisma client extension of the geo fields. Every write checks the values of the geo fields and
 * normalizes them into GeoJSON geometries (a `{ lat, lng }` object into a point), storing a null as the database null
 * of a JSON column. With the `database` provider it also writes the bounding box columns of each geo field, and leaves
 * them out of the results. The PostGIS geometry columns of the `postgis` provider are written by a trigger of the
 * database (see `PostgisSpatialEngine`).
 *
 * @return {Object} The Prisma client extension.
 */
export function spatialExtension(): any {
  // Resolved on the first geo write, so an application without geo fields
  // never reads the provider
  let boxes: boolean | undefined;

  const normalizeRecord = (
    modelName: string,
    data: Record<string, any>
  ): Record<string, any> => {
    const geoFields = spatialSchema().geoFields.get(modelName);
    if (!geoFields) {
      return data;
    }

    boxes ??= spatialProvider() === 'database';
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

      if (boxes) {
        const columns = geoColumns(field);
        const box = geometry ? geometryBox(geometry) : [null, null, null, null];
        normalized[columns.minLng] = box[0];
        normalized[columns.minLat] = box[1];
        normalized[columns.maxLng] = box[2];
        normalized[columns.maxLat] = box[3];
      }
    }
    return normalized;
  };

  const stripRecord = (
    modelName: string,
    record: Record<string, any>
  ): Record<string, any> => {
    const geoFields = spatialSchema().geoFields.get(modelName);
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
          if (spatialSchema().geoFields.size === 0) {
            return query(args);
          }

          const result = await query(
            mapWriteArgs(model, operation, args, normalizeRecord, relatedOf)
          );
          boxes ??= spatialProvider() === 'database';
          return boxes && !COUNT_OPERATIONS.has(operation)
            ? mapResultRecords(model, result, stripRecord, relatedOf)
            : result;
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

/** The related model of every relation, file and audit field of a model. */
function relatedOf(modelName: string): Map<string, string> | undefined {
  return spatialSchema().relatedModels.get(modelName);
}

/** Derives the schema of the loaded models, recomputed when the models change. */
function spatialSchema(): SpatialSchema {
  const loaded = [
    ...(context.resource.models as Map<string, ResourceModel>).values()
  ];
  if (
    cached?.models.length === loaded.length &&
    cached.models.every((model, i) => model === loaded[i])
  ) {
    return cached.schema;
  }

  const authModel = loaded.find(isResourceAuthModel);
  const geoFields = new Map<string, GeoConfig>();
  const relatedModels = new Map<string, Map<string, string>>();

  for (const model of loaded) {
    if (Object.keys(model.config.geo ?? {}).length > 0) {
      geoFields.set(model.name, model.config.geo!);
    }

    const related = new Map<string, string>();
    for (const [field, relation] of Object.entries(
      model.config.relations ?? {}
    )) {
      related.set(field, capitalize(relation.model));
    }
    for (const field of Object.keys(model.config.files ?? {})) {
      related.set(field, 'File');
    }
    if (authModel) {
      related.set('createdBy', authModel.name);
      related.set('deletedBy', authModel.name);
    }
    relatedModels.set(model.name, related);
  }

  const schema = { geoFields, relatedModels };
  cached = { models: loaded, schema };
  return schema;
}
