import {
  ConfigurationError,
  conditionBoxes,
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
import { spatialConfig } from './spatial-config';
import { boxOverlapFilter, boxWithinFilter } from './utils/box-util';

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

/** The trigger keeping the geometry columns of a table in line with its GeoJSON. */
export type GeometryTrigger = {
  /** The source of its function, compared with the one in the database */
  source: string;
  /** The statements creating the function and the trigger, then writing the geometries missing */
  statements: string[];
};

/** The records a batch of the `database` engine reads. */
const SCAN_BATCH = 1000;

/**
 * Finds the records whose geo field matches a spatial condition, for the `_near`, `_within` and `_intersects`
 * operators of the resource queries.
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
   * @param {number} limit - The number of matches past which the search stops, returning more than `limit` of them.
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
    const boxes = conditionBoxes(condition);
    const where =
      condition.operator === 'within'
        ? boxWithinFilter(field, boxes)
        : boxOverlapFilter(field, boxes, model.fields[field].type === 'point');

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
   * Creates the trigger writing the geometry columns of every model whose trigger is missing or out of date, and
   * writes the geometries of its records missing them, under an advisory lock, so the instances starting together
   * set them up once. A start with every trigger in place changes nothing.
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

    const updated = await this._db.transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext('appweaver:spatial'))`
        );
        const existing: { table: string; source: string }[] =
          await tx.$queryRawUnsafe(
            `SELECT c.relname AS "table", p.prosrc AS "source" FROM pg_trigger t ` +
              `JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace ` +
              `JOIN pg_proc p ON p.oid = t.tgfoid WHERE NOT t.tgisinternal ` +
              `AND n.nspname = COALESCE($1::text, current_schema()) AND t.tgname = left(c.relname, 50) || '_geo_sync'`,
            this._schema ?? null
          );
        const sources = new Map(existing.map((row) => [row.table, row.source]));

        const updated: string[] = [];
        for (const model of models) {
          const trigger = geometryTrigger(
            model.table,
            Object.keys(model.fields),
            this._schema
          );
          if (sources.get(model.table) === trigger.source) {
            continue;
          }
          for (const statement of trigger.statements) {
            await tx.$executeRawUnsafe(statement);
          }
          updated.push(model.name);
        }
        return updated;
      },
      // The geometries of a large table written for the first time
      { timeout: spatialConfig.SETUP_TIMEOUT }
    );
    if (updated.length > 0) {
      logger.info({ models: updated }, 'Spatial geometry triggers set up');
    }
  }

  public async match(
    model: GeoModel,
    field: string,
    condition: SpatialCondition,
    limit: number
  ): Promise<SpatialMatch[]> {
    const geom = quote(geoColumns(field).geom);
    const params: unknown[] = [];
    const param = (value: unknown, type: string) => {
      params.push(value);
      return `$${params.length}::${type}`;
    };
    const geometry = (value: GeoGeometry) =>
      `ST_SetSRID(ST_GeomFromGeoJSON(${param(JSON.stringify(value), 'text')}), 4326)`;

    // The boxes of the condition, which the GiST index narrows the records by
    const boxes = conditionBoxes(condition)
      .map(
        (box) =>
          `${geom} && ST_MakeEnvelope(${box.map((value) => param(value, 'float8')).join(', ')}, 4326)`
      )
      .join(' OR ');

    let predicate: string;
    let distance = '';
    switch (condition.operator) {
      case 'near': {
        const [lng, lat] = condition.point;
        const point = `ST_SetSRID(ST_MakePoint(${param(lng, 'float8')}, ${param(lat, 'float8')}), 4326)::geography`;
        distance = `ST_Distance(${geom}::geography, ${point}, false)`;
        predicate = `ST_DWithin(${geom}::geography, ${point}, ${param(condition.maxDistance, 'float8')}, false)`;
        if (condition.minDistance) {
          predicate += ` AND ${distance} >= ${param(condition.minDistance, 'float8')}`;
        }
        break;
      }
      case 'within':
        predicate = `ST_CoveredBy(${geom}, ${geometry(condition.geometry)})`;
        break;
      case 'intersects':
        predicate = `ST_Intersects(${geom}, ${geometry(condition.geometry)})`;
        break;
    }

    const sql =
      `SELECT "id" AS "id"${distance ? `, ${distance} AS "distance"` : ''} ` +
      `FROM ${qualified(model.table, this._schema)} WHERE (${boxes}) AND ${predicate} ` +
      `ORDER BY ${distance ? '"distance", ' : ''}"id" LIMIT ${limit + 1}`;

    const rows: { id: unknown; distance?: number }[] = await this._db
      .client<any>()
      .$queryRawUnsafe(sql, ...params);
    return rows.map((row) =>
      distance ? { id: row.id, distance: Number(row.distance) } : { id: row.id }
    );
  }
}

/**
 * Builds the trigger of a table writing the geometry column of each geo field from its GeoJSON, on an insert and on
 * an update changing the GeoJSON. Its function reads the columns directly, so a write of the other columns costs a
 * comparison only, and does nothing once a migration dropped one of its columns, until the next start replaces it.
 *
 * @param {string} table - The table name.
 * @param {string[]} fields - The geo fields.
 * @param {string} [schema] - The schema of the table, the one of the connection by default.
 * @return {GeometryTrigger} The source of the function and the statements creating the trigger.
 */
export function geometryTrigger(
  table: string,
  fields: string[],
  schema?: string
): GeometryTrigger {
  // Within the 63 characters of a PostgreSQL name
  const name = `${table.slice(0, 50)}_geo_sync`;
  const qualifiedTable = qualified(table, schema);
  const fn = qualified(name, schema);

  const geometry = (json: string) =>
    `CASE WHEN jsonb_typeof(${json}::jsonb) = 'object' THEN ST_SetSRID(ST_GeomFromGeoJSON(${json}::text), 4326) END`;
  const assign = (field: string) =>
    `NEW.${quote(geoColumns(field).geom)} := ${geometry(`NEW.${quote(field)}`)};`;

  const source = [
    '',
    'BEGIN',
    `  IF TG_OP = 'INSERT' THEN`,
    ...fields.map((field) => `    ${assign(field)}`),
    '  ELSE',
    ...fields.flatMap((field) => [
      `    IF NEW.${quote(field)} IS DISTINCT FROM OLD.${quote(field)} THEN`,
      `      ${assign(field)}`,
      '    END IF;'
    ]),
    '  END IF;',
    '  RETURN NEW;',
    // A column a migration dropped
    'EXCEPTION WHEN undefined_column THEN',
    '  RETURN NEW;',
    'END',
    ''
  ].join('\n');

  return {
    source,
    statements: [
      `CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger AS $$${source}$$ LANGUAGE plpgsql`,
      `DROP TRIGGER IF EXISTS ${quote(name)} ON ${qualifiedTable}`,
      `CREATE TRIGGER ${quote(name)} BEFORE INSERT OR UPDATE ON ${qualifiedTable} FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
      ...fields.map((field) => {
        const geom = quote(geoColumns(field).geom);
        return (
          `UPDATE ${qualifiedTable} SET ${geom} = ${geometry(quote(field))} ` +
          `WHERE ${geom} IS NULL AND jsonb_typeof(${quote(field)}::jsonb) = 'object'`
        );
      })
    ]
  };
}

/** Orders the matches of a `near` condition by their distance, then by their id. */
function sortByDistance(matches: SpatialMatch[]): SpatialMatch[] {
  return matches.sort(
    (a, b) =>
      a.distance! - b.distance! ||
      (a.id === b.id ? 0 : (a.id as any) < (b.id as any) ? -1 : 1)
  );
}

/** The quoted name of a table or a function, qualified by its schema when given. */
function qualified(name: string, schema?: string): string {
  return schema ? `${quote(schema)}.${quote(name)}` : quote(name);
}

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
