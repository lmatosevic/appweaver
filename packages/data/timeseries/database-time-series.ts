import {
  ConfigurationError,
  createLogger,
  Database,
  DatabaseType,
  ErrorCode,
  HEALTH_CHECK,
  HealthCheckResult,
  parseDuration,
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
import { postgresSchema } from '../database/utils/schema-util';
import { databaseSeriesConfig } from './database-series-config';
import {
  deleteStatement,
  expiredStatement,
  selectStatement,
  SeriesDialect,
  seriesDialect,
  SeriesRow,
  toSeriesPoints,
  upsertStatements
} from './utils/series-sql-util';

const logger = createLogger('timeseries');

/**
 * The `database` driver of `TimeSeries`: the points of a model in the `<Model>Series` table `weaver generate` adds to
 * the Prisma schema, keyed by the resource and the time, written and queried with SQL over the connection of the
 * database, on SQLite, PostgreSQL, MySQL and SQL Server. The points of a resource are deleted with it by the foreign
 * key of the table, and the points older than the retention of their model (`seriesOptions.retention`, or the
 * `timeseries.database.retention` config) once the application starts, then every `timeseries.database.retentionInterval`,
 * in the instances with `timeseries.database.retentionWorker`.
 */
export class DatabaseTimeSeries extends TimeSeries {
  // The database has its own health check
  static [HEALTH_CHECK] = false;

  public readonly cascadesDeletes: boolean = true;

  public readonly transactional: boolean = true;

  /** @internal */
  protected readonly _db = inject<PrismaDatabase>(Database as any);
  /** @internal */
  protected readonly _type = resolveDatabaseType(
    databaseConfig.TYPE,
    databaseConfig.URL
  );
  /** The PostgreSQL schema of the connection, `public` without one. @internal */
  protected readonly _schema = postgresSchema(this._type);
  /** @internal */
  protected readonly _dialect: SeriesDialect = seriesDialect(
    this._type,
    this._schema
  );

  /** @internal */
  private _retentions: [SeriesModel, number][] = [];
  /** @internal */
  private _purgeTimer?: NodeJS.Timeout;

  public async onInit(): Promise<void> {}

  public async onDestroy(): Promise<void> {
    clearInterval(this._purgeTimer);
    this._purgeTimer = undefined;
  }

  /**
   * Starts deleting the points older than the retention of their model, at once and every
   * `timeseries.database.retentionInterval`.
   *
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` for a retention or an interval that is not a duration.
   */
  public async register(models: SeriesModel[]): Promise<void> {
    this._retentions = models.flatMap((model) => {
      const retention =
        model.options.retention ?? databaseSeriesConfig.RETENTION;
      return retention
        ? [
            [model, seconds(retention, `retention of ${model.name}`)] as [
              SeriesModel,
              number
            ]
          ]
        : [];
    });

    clearInterval(this._purgeTimer);
    this._purgeTimer = undefined;
    const interval = seconds(
      databaseSeriesConfig.RETENTION_INTERVAL,
      'retention interval'
    );
    if (
      this._retentions.length === 0 ||
      !databaseSeriesConfig.RETENTION_WORKER
    ) {
      return;
    }

    const run = () =>
      void this.purge().catch((error) =>
        logger.error(error, 'Cannot delete the expired time series points')
      );
    this._purgeTimer = setInterval(run, interval * 1000);
    this._purgeTimer.unref();
    run();
  }

  /**
   * Deletes the points older than the retention of their model, of the models registered with a retention.
   *
   * @param {Date} [now] - The time the retentions count back from.
   * @return {Promise<number>} The number of points deleted.
   */
  public async purge(now: Date = new Date()): Promise<number> {
    let count = 0;
    for (const [model, retention] of this._retentions) {
      try {
        const deleted: number = await this.client().$executeRaw(
          expiredStatement(
            this._dialect,
            model,
            new Date(now.getTime() - retention * 1000)
          )
        );
        count += deleted;
        if (deleted > 0) {
          logger.debug(
            { model: model.name, points: deleted },
            'Expired time series points deleted'
          );
        }
      } catch (error) {
        throw toDatabaseError(error, model.name);
      }
    }
    return count;
  }

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

/** The seconds of a duration, checked to be one of whole seconds. */
function seconds(duration: string, option: string): number {
  const value = parseDuration(duration);
  if (!value || !Number.isInteger(value)) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `The time series ${option} '${duration}' is not a duration of whole seconds, i.e. 365d`
    );
  }
  return value;
}
