import { AnyNull } from '@prisma/client/runtime/client';
import {
  capitalize,
  createLogger,
  Database,
  DatabaseType,
  ErrorCode,
  geoColumns,
  hasGeo,
  isAppweaverError,
  isArray,
  isPlainObject,
  LIFECYCLE,
  OnInit,
  ResourceModel,
  resolveDatabaseType,
  SpatialCondition,
  spatialCondition,
  SpatialError,
  SpatialMatch
} from '@appweaver/common';
import { inject } from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import { databaseConfig } from '../database/database-config';
import { PrismaDatabase } from '../database/prisma-database';
import { fingerprintAs } from '../resource/utils/cursor-util';
import { ResolvedFilterConditions } from '../resource/utils/filter-util';
import {
  spatialConfig,
  spatialMaxCandidates,
  spatialProvider
} from './spatial-config';
import {
  DatabaseSpatialEngine,
  GeoModel,
  PostgisSpatialEngine,
  SpatialEngine
} from './spatial-engine';

const logger = createLogger('spatial');

// The operators combining nested filters of the same model
const LOGICAL_OPERATORS = new Set(['_and', '_or', '_not', '_nor']);
const QUANTIFIERS = new Set(['_some', '_every', '_none']);
const SPATIAL_OPERATORS = new Set([
  '_near',
  '_within',
  '_withinBox',
  '_intersects'
]);

/** A query filter with its spatial operators resolved. */
export type ResolvedSpatialFilter = {
  /** The filter, every geo field condition replaced by its database conditions */
  filter: any;
  /** The distances in meters of the records matching the `_near` operator of each geo field of the top level */
  distances: Map<string, Map<unknown, number>>;
};

/**
 * Resolves the spatial operators of the query filters (`_near`, `_within`, `_withinBox`, `_intersects`) into the ids
 * of the matching records, with the `postgis` or the `database` engine of the `spatial.provider` config, and sets up
 * the engine when the application starts.
 */
export class SpatialService implements OnInit {
  static [LIFECYCLE] = true;

  /** @internal */
  private readonly _db = inject<PrismaDatabase>(Database as any);
  /** @internal */
  private _engine?: SpatialEngine;
  /** @internal */
  private _setup?: Promise<void>;

  /**
   * Sets up the engine for the geo fields of the models, i.e. the triggers of PostGIS.
   *
   * @throws {ConfigurationError} When the engine refuses its setup, i.e. without the PostGIS extension.
   */
  public async onInit(): Promise<void> {
    if (this.models().length === 0) {
      return;
    }
    try {
      await this.ensureSetup();
    } catch (error) {
      // An invalid setup fails the start, while an unreachable database is set
      // up again by the next spatial query
      if (isAppweaverError(error) && error.module === 'configuration') {
        throw error;
      }
      logger.error(
        error,
        'Cannot set up the spatial engine, retrying on the next use'
      );
    }
  }

  /**
   * Returns the geo fields of every model declaring some.
   *
   * @return {GeoModel[]} The models.
   */
  public models(): GeoModel[] {
    return [...context.resource.models.values()]
      .filter((model) => hasGeo(model.config))
      .map(geoModelOf);
  }

  /**
   * Resolves the spatial operators of a query filter, on its top level, in its logical operators and in the filters
   * of its relations, into the ids of the matching records. A `null` or an `_exists` of a geo field becomes a null
   * check of its column.
   *
   * @param {any} filter - The query filter.
   * @param {string} modelName - The model the filter is matched against.
   * @return {Promise<ResolvedSpatialFilter>} The resolved filter, and the distances of the `_near` matches.
   * @throws {SpatialError} `SPATIAL_INVALID_FILTER` for an invalid operator of a geo field, and
   * `SPATIAL_TOO_MANY_CANDIDATES` when a condition matches more records than `spatial.maxCandidates`.
   */
  public async resolveFilter(
    filter: any,
    modelName: string
  ): Promise<ResolvedSpatialFilter> {
    const distances = new Map<string, Map<unknown, number>>();
    if (!isPlainObject(filter) || this.models().length === 0) {
      return { filter, distances };
    }
    const resolved = await this.resolveLevel(
      filter,
      modelName,
      distances,
      true
    );
    return { filter: resolved, distances };
  }

  /**
   * Finds the records of a model whose geo field matches a spatial condition.
   *
   * @param {string} modelName - The model name.
   * @param {string} field - The geo field.
   * @param {SpatialCondition} condition - The condition.
   * @return {Promise<SpatialMatch[]>} The matches, ordered by their distance for a `near` condition.
   * @throws {SpatialError} `SPATIAL_TOO_MANY_CANDIDATES` when more records than `spatial.maxCandidates` match.
   */
  public async match(
    modelName: string,
    field: string,
    condition: SpatialCondition
  ): Promise<SpatialMatch[]> {
    const model = context.resource.models.get(modelName);
    if (!model?.config.geo?.[field]) {
      throw new SpatialError(
        ErrorCode.SpatialInvalidFilter,
        `${modelName}.${field} is not a geo field`,
        { model: modelName, field, reason: 'not a geo field' }
      );
    }

    await this.ensureSetup();
    const limit = spatialMaxCandidates();
    const matches = await this.engine().match(
      geoModelOf(model),
      field,
      condition,
      limit
    );
    if (matches.length > limit) {
      throw new SpatialError(
        ErrorCode.SpatialTooManyCandidates,
        `The spatial filter of ${modelName}.${field} matches more than ${limit} records, narrow it down`,
        { model: modelName, field, maxCandidates: limit }
      );
    }
    return matches;
  }

  /** @internal */
  private async resolveLevel(
    filter: any,
    modelName: string,
    distances: Map<string, Map<unknown, number>>,
    topLevel: boolean
  ): Promise<any> {
    if (isArray(filter)) {
      return Promise.all(
        filter.map((item) =>
          this.resolveLevel(item, modelName, distances, false)
        )
      );
    }
    if (!isPlainObject(filter)) {
      return filter;
    }

    const model = context.resource.models.get(modelName);
    const geo = model?.config.geo ?? {};
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(filter)) {
      if (LOGICAL_OPERATORS.has(key) || QUANTIFIERS.has(key)) {
        resolved[key] = await this.resolveLevel(
          value,
          modelName,
          distances,
          false
        );
      } else if (geo[key]) {
        resolved[key] = await this.resolveField(
          modelName,
          key,
          value,
          topLevel ? distances : undefined
        );
      } else {
        const related = relatedModelName(model, key);
        resolved[key] =
          related && (isPlainObject(value) || isArray(value))
            ? await this.resolveLevel(value, related, distances, false)
            : value;
      }
    }
    return resolved;
  }

  /** The database conditions of the value of a geo field in a filter. @internal */
  private async resolveField(
    modelName: string,
    field: string,
    value: unknown,
    distances?: Map<string, Map<unknown, number>>
  ): Promise<ResolvedFilterConditions> {
    if (value === null) {
      return new ResolvedFilterConditions([this.existsCondition(field, false)]);
    }
    if (!isPlainObject(value)) {
      throw invalidFilter(
        modelName,
        field,
        'expected an object of the spatial operators _near, _within, _withinBox, _intersects or _exists'
      );
    }

    const conditions: any[] = [];
    for (const [operator, operand] of Object.entries(value)) {
      if (operator === '_exists') {
        conditions.push(
          this.existsCondition(field, operand !== false && operand !== 'false')
        );
        continue;
      }
      if (!SPATIAL_OPERATORS.has(operator)) {
        throw invalidFilter(
          modelName,
          field,
          `unknown operator ${operator}, expected _near, _within, _withinBox, _intersects or _exists`
        );
      }

      let condition: SpatialCondition;
      try {
        condition = spatialCondition(
          operator,
          operand,
          spatialConfig.MAX_VERTICES
        );
      } catch (error) {
        throw invalidFilter(modelName, field, (error as Error).message);
      }

      const matches = await this.match(modelName, field, condition);
      if (distances && condition.operator === 'near') {
        distances.set(
          field,
          new Map(matches.map((match) => [match.id, match.distance!]))
        );
      }
      const ids = fingerprintAs(
        matches.map((match) => match.id),
        { [field]: { [operator]: operand } }
      );
      conditions.push({ id: { in: ids } });
    }
    return new ResolvedFilterConditions(conditions);
  }

  /** The condition of the records with a value of a geo field, or without one. @internal */
  private existsCondition(field: string, exists: boolean): any {
    // The bounding box columns are null exactly when the geometry is, while
    // the JSON null of the GeoJSON column needs the null sentinel of Prisma,
    // except on SQL Server, where it is a string column
    if (spatialProvider() === 'database') {
      const column = geoColumns(field).minLng;
      return { [column]: exists ? { not: null } : null };
    }
    const type = resolveDatabaseType(databaseConfig.TYPE, databaseConfig.URL);
    const nullValue = type === DatabaseType.SQLServer ? null : AnyNull;
    return {
      [field]: exists ? { not: nullValue } : { equals: nullValue }
    };
  }

  /** @internal */
  private engine(): SpatialEngine {
    this._engine ??=
      spatialProvider() === 'postgis'
        ? new PostgisSpatialEngine(this._db)
        : new DatabaseSpatialEngine(this._db);
    return this._engine;
  }

  /** Sets up the engine once, again on the next call after a failure. @internal */
  private ensureSetup(): Promise<void> {
    this._setup ??= this.engine()
      .setup(this.models())
      .catch((error) => {
        this._setup = undefined;
        throw error;
      });
    return this._setup;
  }
}

/** The geo fields of a model and its table. */
function geoModelOf(model: ResourceModel): GeoModel {
  return {
    name: model.name,
    table: model.config.tableName ?? model.name,
    fields: { ...model.config.geo }
  };
}

/** The related model of a relation or a file field of a model. */
function relatedModelName(
  model: ResourceModel | undefined,
  field: string
): string | undefined {
  const relation = model?.config.relations?.[field];
  if (relation) {
    return capitalize(relation.model);
  }
  return model?.config.files?.[field] ? 'File' : undefined;
}

function invalidFilter(
  modelName: string,
  field: string,
  reason: string
): SpatialError {
  return new SpatialError(
    ErrorCode.SpatialInvalidFilter,
    `Invalid spatial filter of ${modelName}.${field}: ${reason}`,
    { model: modelName, field, reason }
  );
}
