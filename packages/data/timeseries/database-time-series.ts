import {
  Database,
  HEALTH_CHECK,
  HealthCheckResult,
  resolveDatabaseType,
  SeriesDeleteQuery,
  SeriesModel,
  SeriesPoint,
  SeriesQuery,
  TimeSeries
} from '@appweaver/common';
import { inject } from '@appweaver/core';
import { databaseConfig } from '../database/database-config';
import { toDatabaseError } from '../database/database-error';
import { PrismaDatabase } from '../database/prisma-database';
import {
  deleteStatement,
  selectStatement,
  SeriesDialect,
  seriesDialect,
  SeriesRow,
  toSeriesPoints,
  upsertStatements
} from './utils/series-sql-util';

/**
 * The `database` driver of `TimeSeries`: the points of a model in the `<Model>Series` table `weaver generate` adds to
 * the Prisma schema, keyed by the resource and the time, written and queried with SQL over the connection of the
 * database, on SQLite, PostgreSQL, MySQL and SQL Server. The points of a resource are deleted with it by the foreign
 * key of the table.
 */
export class DatabaseTimeSeries extends TimeSeries {
  // The database has its own health check
  static [HEALTH_CHECK] = false;

  public readonly cascadesDeletes: boolean = true;

  /** @internal */
  protected readonly _db = inject<PrismaDatabase>(Database as any);
  /** @internal */
  protected readonly _dialect: SeriesDialect = seriesDialect(
    resolveDatabaseType(databaseConfig.TYPE, databaseConfig.URL)
  );

  public async onInit(): Promise<void> {}

  public async onDestroy(): Promise<void> {}

  public async register(_models: SeriesModel[]): Promise<void> {}

  public async write(
    model: SeriesModel,
    points: SeriesPoint[]
  ): Promise<number> {
    const statements = upsertStatements(this._dialect, model, points);
    try {
      if (statements.length === 1) {
        await this.client().$executeRaw(statements[0]);
      } else if (statements.length > 1) {
        await this._db.transaction(async (tx) => {
          for (const statement of statements) {
            await tx.$executeRaw(statement);
          }
        });
      }
    } catch (error) {
      throw toDatabaseError(error, model.name);
    }
    return points.length;
  }

  public async query(
    model: SeriesModel,
    query: SeriesQuery
  ): Promise<SeriesPoint[]> {
    try {
      const rows: SeriesRow[] = await this.client().$queryRaw(
        selectStatement(this._dialect, model, query, this.bucket.bind(this))
      );
      return toSeriesPoints(model, query, rows);
    } catch (error) {
      throw toDatabaseError(error, model.name);
    }
  }

  public async delete(
    model: SeriesModel,
    query: SeriesDeleteQuery
  ): Promise<number> {
    try {
      return await this.client().$executeRaw(
        deleteStatement(this._dialect, model, query)
      );
    } catch (error) {
      throw toDatabaseError(error, model.name);
    }
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    return this._db.checkHealth();
  }

  /** The start of the bucket of a time column, overridden by a store with its own bucket function. */
  protected bucket(column: string, width: number): string {
    return this._dialect.bucket(column, width);
  }

  /** @internal */
  protected client(): any {
    return this._db.client<any>();
  }
}
