import {
  ConfigurationError,
  conditionBox,
  createLogger,
  ErrorCode,
  geoColumns,
  GeoConfig,
  GeoGeometry,
  matchSpatialCondition,
  resolveDatabaseType,
  SpatialCondition,
  SpatialMatch,
  uncapitalize
} from '@appweaver/common';
import { databaseConfig } from '../database/database-config';
import { PrismaDatabase } from '../database/prisma-database';
import { postgresSchema } from '../utils/schema-util';

const logger = createLogger('spatial');

/** The geo fields of a model and the table holding them. */
export type GeoModel = {
  /** The model name */
  name: string;
  /** The table name */
  table: string;
  /** The geo fields */
  fields: GeoConfig;
};

/** The maximum milliseconds the triggers of PostGIS take to set up. */
const SETUP_TIMEOUT = 60_000;

/** The records a batch of the `database` engine reads. */
const SCAN_BATCH = 1000;

/**
 * Finds the records whose geo field matches a spatial condition, for the spatial filters of the resource queries.
 */
export abstract class SpatialEngine {
  constructor(protected readonly _db: PrismaDatabase) {}

  /**
   * Prepares the database for the geo fields of the models, called before the first spatial query.
   *
   * @param {GeoModel[]} models - The models with geo fields.
   */
  abstract setup(models: GeoModel[]): Promise<void>;

  /**
   * Finds the records whose geo field matches a condition, ordered by their distance for a `near` condition.
   *
   * @param {GeoModel} model - The model.
   * @param {string} field - The geo field.
   * @param {SpatialCondition} condition - The condition.
   * @param {number} limit - The number of matches past which the search stops, returning `limit + 1` of them.
   * @return {Promise<SpatialMatch[]>} The matches, with their distances in meters for a `near` condition.
   */
  abstract match(
    model: GeoModel,
    field: string,
    condition: SpatialCondition,
    limit: number
  ): Promise<SpatialMatch[]>;
}

/**
 * The `database` engine, running on every database: the bounding box columns of a geo field narrow the records in a
 * query of the database, then each geometry is matched in the application.
 */
export class DatabaseSpatialEngine extends SpatialEngine {
  public async setup(): Promise<void> {}

  public async match(
    model: GeoModel,
    field: string,
    condition: SpatialCondition,
    limit: number
  ): Promise<SpatialMatch[]> {
    const delegate = this._db.client<any>()[uncapitalize(model.name)];
    const where = this.boxFilter(model, field, condition);

    const matches: SpatialMatch[] = [];
    let cursor: unknown;
    for (;;) {
      const rows: Record<string, any>[] = await delegate.findMany({
        where,
        select: { id: true, [field]: true },
        orderBy: { id: 'asc' },
        take: SCAN_BATCH,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 })
      });

      for (const row of rows) {
        const geometry = row[field] as GeoGeometry | null;
        const matched = geometry
          ? matchSpatialCondition(geometry, condition)
          : false;
        if (matched !== false) {
          matches.push(
            typeof matched === 'number'
              ? { id: row.id, distance: matched }
              : { id: row.id }
          );
        }
      }

      // Past the limit, the caller rejects the condition anyway
      if (rows.length < SCAN_BATCH || matches.length > limit) {
        break;
      }
      cursor = rows[rows.length - 1].id;
    }

    return condition.operator === 'near' ? sortByDistance(matches) : matches;
  }

  /** The condition of the bounding box columns of the records a condition may match. @internal */
  private boxFilter(
    model: GeoModel,
    field: string,
    condition: SpatialCondition
  ): Record<string, any> {
    const [minLng, minLat, maxLng, maxLat] = conditionBox(condition);
    const columns = geoColumns(field);

    // A geometry covered by the box has its own box inside it
    if (condition.operator === 'within' || condition.operator === 'withinBox') {
      return {
        [columns.minLng]: { gte: minLng, lte: maxLng },
        [columns.minLat]: { gte: minLat, lte: maxLat },
        [columns.maxLng]: { lte: maxLng },
        [columns.maxLat]: { lte: maxLat }
      };
    }

    // A point keeps the same minimum and maximum, so its box lies inside the
    // box of the condition, which an index on the minimums narrows best
    if (model.fields[field]?.type === 'point') {
      return {
        [columns.minLng]: { gte: minLng, lte: maxLng },
        [columns.minLat]: { gte: minLat, lte: maxLat }
      };
    }
    return {
      [columns.minLng]: { lte: maxLng },
      [columns.minLat]: { lte: maxLat },
      [columns.maxLng]: { gte: minLng },
      [columns.maxLat]: { gte: minLat }
    };
  }
}

/**
 * The `postgis` engine, for PostgreSQL with the PostGIS extension: a trigger keeps a geometry column of each geo field
 * in line with its GeoJSON, indexed with GiST and queried with the functions of PostGIS. The distances are measured on
 * a sphere, like the `database` engine.
 */
export class PostgisSpatialEngine extends SpatialEngine {
  /** @internal */
  private readonly _schema = postgresSchema(
    resolveDatabaseType(databaseConfig.TYPE, databaseConfig.URL)
  );

  /**
   * Creates the trigger writing the geometry columns of every model, and writes the columns of the records missing
   * them, under an advisory lock, so the instances starting together set them up once.
   *
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` when the PostGIS extension is not installed.
   */
  public async setup(models: GeoModel[]): Promise<void> {
    if (models.length === 0) {
      return;
    }

    const rows: unknown[] = await this._db
      .client<any>()
      .$queryRawUnsafe(
        `SELECT extversion FROM pg_extension WHERE extname = 'postgis'`
      );
    if (rows.length === 0) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        'The postgis extension is not installed in the database, apply the migrations of the generated schema, ' +
          'which create it, or set spatial.provider to database'
      );
    }

    const fn = this.table('appweaver_geo_sync');
    await this._db.transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext('appweaver:spatial'))`
        );
        await tx.$executeRawUnsafe(triggerFunction(fn));
        for (const model of models) {
          for (const statement of triggerStatements(
            this.table(model.table),
            model.table,
            fn,
            Object.keys(model.fields)
          )) {
            await tx.$executeRawUnsafe(statement);
          }
        }
      },
      // The geometries of a large table written for the first time
      { timeout: SETUP_TIMEOUT }
    );
    logger.debug(
      { models: models.map((model) => model.name) },
      'Spatial geometry triggers set up'
    );
  }

  public async match(
    model: GeoModel,
    field: string,
    condition: SpatialCondition,
    limit: number
  ): Promise<SpatialMatch[]> {
    const geom = quote(geoColumns(field).geom);
    const [minLng, minLat, maxLng, maxLat] = conditionBox(condition);
    const params: unknown[] = [minLng, minLat, maxLng, maxLat];
    const param = (value: unknown, type: string) => {
      params.push(value);
      return `$${params.length}::${type}`;
    };

    let predicate: string;
    let distance = '';
    switch (condition.operator) {
      case 'near': {
        const point = `ST_SetSRID(ST_MakePoint(${param(condition.point[0], 'float8')}, ${param(condition.point[1], 'float8')}), 4326)::geography`;
        distance = `ST_Distance(${geom}::geography, ${point}, false)`;
        predicate = `ST_DWithin(${geom}::geography, ${point}, ${param(condition.maxDistance, 'float8')}, false)`;
        if (condition.minDistance) {
          predicate += ` AND ${distance} >= ${param(condition.minDistance, 'float8')}`;
        }
        break;
      }
      case 'withinBox':
        predicate = `ST_CoveredBy(${geom}, ST_MakeEnvelope($1::float8, $2::float8, $3::float8, $4::float8, 4326))`;
        break;
      case 'within':
        predicate = `ST_CoveredBy(${geom}, ${geometryParam(param, condition.geometry)})`;
        break;
      case 'intersects':
        predicate = `ST_Intersects(${geom}, ${geometryParam(param, condition.geometry)})`;
        break;
    }

    const sql =
      `SELECT "id" AS "id"${distance ? `, ${distance} AS "distance"` : ''} FROM ${this.table(model.table)} ` +
      `WHERE ${geom} && ST_MakeEnvelope($1::float8, $2::float8, $3::float8, $4::float8, 4326) AND ${predicate} ` +
      `ORDER BY ${distance ? '"distance", ' : ''}"id" LIMIT ${limit + 1}`;

    const rows: { id: unknown; distance?: number }[] = await this._db
      .client<any>()
      .$queryRawUnsafe(sql, ...params);
    return rows.map((row) =>
      distance ? { id: row.id, distance: Number(row.distance) } : { id: row.id }
    );
  }

  /** The quoted name of a table or a function, qualified by the schema of the connection when it has one. @internal */
  private table(name: string): string {
    return this._schema ? `${quote(this._schema)}.${quote(name)}` : quote(name);
  }
}

/** Orders the matches of a `near` condition by their distance, then by their id. */
function sortByDistance(matches: SpatialMatch[]): SpatialMatch[] {
  return matches.sort(
    (a, b) =>
      a.distance! - b.distance! ||
      (a.id === b.id ? 0 : (a.id as any) < (b.id as any) ? -1 : 1)
  );
}

/** A GeoJSON geometry as a PostGIS geometry of SRID 4326, its JSON bound as a parameter. */
function geometryParam(
  param: (value: unknown, type: string) => string,
  geometry: GeoGeometry
): string {
  return `ST_SetSRID(ST_GeomFromGeoJSON(${param(JSON.stringify(geometry), 'text')}), 4326)`;
}

/**
 * The function of the triggers writing the geometry columns from the GeoJSON of the geo fields, given as the arguments
 * of a trigger. It skips a field whose geometry column no longer exists, so a migration can drop a geo field before the
 * application updates the trigger, and an update leaving the GeoJSON unchanged.
 *
 * @param {string} name - The quoted function name, qualified by its schema.
 * @return {string} The statement creating the function.
 */
export function triggerFunction(name: string): string {
  return `CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $$
DECLARE
  data jsonb := to_jsonb(NEW);
  changes jsonb := '{}';
  field text;
BEGIN
  FOREACH field IN ARRAY TG_ARGV LOOP
    CONTINUE WHEN NOT data ? (field || 'Geom')
      OR (TG_OP = 'UPDATE' AND to_jsonb(OLD) -> field IS NOT DISTINCT FROM data -> field);
    changes := changes || jsonb_build_object(field || 'Geom',
      CASE WHEN jsonb_typeof(data -> field) = 'object'
        THEN encode(ST_AsEWKB(ST_SetSRID(ST_GeomFromGeoJSON(data -> field), 4326)), 'hex') END);
  END LOOP;
  RETURN jsonb_populate_record(NEW, changes);
END
$$ LANGUAGE plpgsql`;
}

/**
 * The statements creating the trigger of a table, calling the trigger function with its geo fields, then writing the
 * geometry of the records missing it.
 *
 * @param {string} table - The quoted table, qualified by its schema.
 * @param {string} tableName - The table name.
 * @param {string} fn - The quoted trigger function, qualified by its schema.
 * @param {string[]} fields - The geo fields.
 * @return {string[]} The statements.
 */
export function triggerStatements(
  table: string,
  tableName: string,
  fn: string,
  fields: string[]
): string[] {
  // Within the 63 characters of a PostgreSQL name
  const trigger = quote(`${tableName.slice(0, 50)}_geo_sync`);
  const args = fields.map((field) => `'${field.replace(/'/g, "''")}'`);

  return [
    `DROP TRIGGER IF EXISTS ${trigger} ON ${table}`,
    `CREATE TRIGGER ${trigger} BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${fn}(${args.join(', ')})`,
    ...fields.map((field) => {
      const json = quote(field);
      const geom = quote(geoColumns(field).geom);
      return (
        `UPDATE ${table} SET ${geom} = ST_SetSRID(ST_GeomFromGeoJSON(${json}::jsonb), 4326) ` +
        `WHERE ${geom} IS NULL AND jsonb_typeof(${json}::jsonb) = 'object'`
      );
    })
  ];
}

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
