import {
  ConfigurationError,
  createLogger,
  DatabaseType,
  ErrorCode,
  HEALTH_CHECK,
  parseDuration,
  resolveDatabaseType,
  SeriesModel
} from '@appweaver/common';
import { raw, sqltag } from '@prisma/client/runtime/client';
import { databaseConfig } from '../database/database-config';
import { DatabaseTimeSeries } from './database-time-series';
import { timescaleConfig } from './timescale-config';

const logger = createLogger('timeseries');

/** A policy of a hypertable, by the name of its job and the key of its interval. */
type Policy = {
  proc: string;
  key: string;
  add: (table: string, interval: string) => string;
  remove: (table: string) => string;
};

const COMPRESSION: Policy = {
  proc: 'policy_compression',
  key: 'compress_after',
  add: (table, interval) =>
    `SELECT add_compression_policy('${table}', INTERVAL '${interval}')`,
  remove: (table) =>
    `SELECT remove_compression_policy('${table}', if_exists => TRUE)`
};

const RETENTION: Policy = {
  proc: 'policy_retention',
  key: 'drop_after',
  add: (table, interval) =>
    `SELECT add_retention_policy('${table}', INTERVAL '${interval}')`,
  remove: (table) =>
    `SELECT remove_retention_policy('${table}', if_exists => TRUE)`
};

/**
 * The `timescale` driver of `TimeSeries`: the `database` driver on a PostgreSQL database with the TimescaleDB
 * extension, which turns the series tables into hypertables at startup, partitioned by time, aggregates with
 * `time_bucket`, and keeps the compression and retention policies of each model in line with its config.
 */
export class TimescaleTimeSeries extends DatabaseTimeSeries {
  static [HEALTH_CHECK] = false;

  /**
   * Creates the extension when missing, turns the series tables into hypertables and applies their policies, under
   * an advisory lock, so the instances starting together set them up once.
   *
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` on a database other than PostgreSQL, or one without the
   * TimescaleDB extension that cannot be created.
   */
  public async register(models: SeriesModel[]): Promise<void> {
    const type = resolveDatabaseType(databaseConfig.TYPE, databaseConfig.URL);
    if (type !== DatabaseType.PostgreSQL) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `The timescale time series provider needs a PostgreSQL database, not ${type}`
      );
    }
    if (models.length === 0) {
      return;
    }

    await this.ensureExtension();
    await this._db.transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext('appweaver:timeseries'))`
        );
        for (const model of models) {
          await this.setupHypertable(tx, model);
        }
      },
      { timeout: timescaleConfig.SETUP_TIMEOUT }
    );
  }

  protected bucket(column: string, width: number): string {
    return `time_bucket(INTERVAL '${width} seconds', ${column}, TIMESTAMP '1970-01-01 00:00:00')`;
  }

  /** @internal */
  private async ensureExtension(): Promise<void> {
    const rows: unknown[] = await this.client().$queryRaw(
      sqltag`SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'`
    );
    if (rows.length > 0) {
      return;
    }

    try {
      await this.client().$executeRawUnsafe(
        'CREATE EXTENSION IF NOT EXISTS timescaledb'
      );
      logger.info('Created the timescaledb extension');
    } catch (error) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        'The timescaledb extension is not installed in the database and cannot be created, ' +
          'create it with `CREATE EXTENSION timescaledb` or use a TimescaleDB image',
        undefined,
        { cause: error }
      );
    }
  }

  /** @internal */
  private async setupHypertable(tx: any, model: SeriesModel): Promise<void> {
    const table = this.regclass(model.table);
    const chunk = interval(
      model.options.chunkInterval ?? timescaleConfig.CHUNK_INTERVAL,
      'chunkInterval'
    );

    // The primary key holds the time, and no other index is created, so the
    // schema stays the one of the Prisma migrations
    await tx.$executeRawUnsafe(
      `SELECT create_hypertable('${table}', by_range('time', INTERVAL '${chunk}'), ` +
        'if_not_exists => TRUE, create_default_indexes => FALSE, migrate_data => TRUE)'
    );
    await tx.$executeRawUnsafe(
      `SELECT set_chunk_time_interval('${table}', INTERVAL '${chunk}')`
    );

    const compressAfter =
      model.options.compressAfter ?? timescaleConfig.COMPRESS_AFTER;
    if (compressAfter) {
      const [settings]: { compression_enabled: boolean }[] = await tx.$queryRaw(
        sqltag`SELECT compression_enabled FROM timescaledb_information.hypertables
          WHERE hypertable_schema = ${this._schema ?? raw('current_schema()')} AND hypertable_name = ${model.table}`
      );
      if (!settings?.compression_enabled) {
        await tx.$executeRawUnsafe(
          `ALTER TABLE ${this._dialect.table(model.table)} SET (timescaledb.compress, ` +
            `timescaledb.compress_segmentby = '"resourceId"', timescaledb.compress_orderby = '"time" DESC')`
        );
      }
    }
    await this.syncPolicy(
      tx,
      model,
      COMPRESSION,
      compressAfter,
      'compressAfter'
    );
    await this.syncPolicy(
      tx,
      model,
      RETENTION,
      model.options.retention ?? timescaleConfig.RETENTION,
      'retention'
    );

    logger.debug(
      { model: model.name, table: model.table },
      'Time series hypertable set up'
    );
  }

  /** The table of a model as a regclass literal, qualified by the schema of the connection. @internal */
  private regclass(table: string): string {
    return this._dialect.table(table).replace(/'/g, "''");
  }

  /** Adds, replaces or removes a policy of a hypertable, so it follows its config. @internal */
  private async syncPolicy(
    tx: any,
    model: SeriesModel,
    policy: Policy,
    duration: string,
    option: string
  ): Promise<void> {
    const table = this.regclass(model.table);
    const wanted = duration ? interval(duration, option) : undefined;
    const [job]: { same: boolean }[] = await tx.$queryRaw(
      sqltag`SELECT (config->>${policy.key})::interval = ${raw(
        wanted ? `INTERVAL '${wanted}'` : 'NULL'
      )} AS same FROM timescaledb_information.jobs
        WHERE proc_name = ${policy.proc} AND hypertable_schema = ${this._schema ?? raw('current_schema()')} AND hypertable_name = ${model.table}`
    );

    if (job?.same) {
      return;
    }
    if (job) {
      await tx.$executeRawUnsafe(policy.remove(table));
    }
    if (wanted) {
      await tx.$executeRawUnsafe(policy.add(table, wanted));
    }
  }
}

/** The interval of a duration in seconds, checked to be one. */
function interval(duration: string, option: string): string {
  const seconds = parseDuration(duration);
  if (!seconds || !Number.isInteger(seconds)) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `The time series ${option} '${duration}' is not a duration of whole seconds, i.e. 7d`
    );
  }
  for (const [unit, size] of INTERVAL_UNITS) {
    if (seconds % size === 0) {
      return `${seconds / size} ${unit}`;
    }
  }
  return `${seconds} seconds`;
}

const INTERVAL_UNITS: [string, number][] = [
  ['days', 86_400],
  ['hours', 3600],
  ['minutes', 60]
];
