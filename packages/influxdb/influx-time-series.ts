import { InfluxDBClient } from '@influxdata/influxdb3-client';
import {
  ConfigurationError,
  createLogger,
  ErrorCode,
  HealthCheckResult,
  parseDuration,
  ResourceId,
  SeriesAggregate,
  SeriesDeleteQuery,
  SeriesModel,
  SeriesPoint,
  SeriesQuery,
  SeriesValue,
  TimeSeries,
  TimeSeriesError
} from '@appweaver/common';
import { influxConfig } from './config';

const logger = createLogger('timeseries');

/**
 * The `influxdb` driver of `TimeSeries`, on InfluxDB 3 (Core, Enterprise and Cloud): the points of a model in the
 * table of its series (`<Model>Series`), the resource id as the `resourceId` tag and the series fields as its fields,
 * written as line protocol and queried with SQL. The server creates the database and the tables on the first write.
 * InfluxDB 3 deletes no points but by the retention period of its database, so the points of a deleted resource are
 * kept until then, and are no longer served, since the routes read the resource first.
 *
 * InfluxDB 3 keeps a retention period per database, not per table, so the `timeseries.influxdb.retention` config sets
 * the one of the database, and a model with its own `seriesOptions.retention` writes to a database of its own,
 * `<database>_<table>`, with that retention. Both are set when the application starts, through the configure API of
 * InfluxDB 3 Core and Enterprise.
 */
export class InfluxTimeSeries extends TimeSeries {
  public readonly supportsDelete: boolean = false;

  /** @internal */
  private _client?: InfluxDBClient;

  public async onInit(): Promise<void> {
    this.client();
  }

  public async onDestroy(): Promise<void> {
    await this._client?.close();
    this._client = undefined;
  }

  /**
   * Creates the databases with a retention period, or updates their retention: the database of the config with the
   * `timeseries.influxdb.retention`, and the database of each model with its own `seriesOptions.retention`.
   *
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` for a retention that is not a duration of whole seconds, or a
   * server without the configure API (InfluxDB Cloud, whose databases set their retention themselves).
   */
  public async register(models: SeriesModel[]): Promise<void> {
    const retentions = new Map<string, string>();
    if (influxConfig.RETENTION) {
      retentions.set(influxConfig.DATABASE, influxConfig.RETENTION);
    }
    for (const model of models) {
      if (model.options.retention) {
        retentions.set(databaseOf(model), model.options.retention);
      }
    }

    for (const [database, retention] of retentions) {
      await this.configureDatabase(database, retentionPeriod(retention));
    }
  }

  public async write(
    model: SeriesModel,
    points: SeriesPoint[]
  ): Promise<number> {
    const lines = points
      .map((point) => lineProtocol(model, point))
      .filter((line): line is string => line !== undefined);
    if (lines.length === 0) {
      return 0;
    }

    try {
      await this.client().write(
        lines.join('\n'),
        databaseOf(model),
        undefined,
        {
          precision: 'ms'
        }
      );
    } catch (error) {
      throw unavailable('write', error);
    }
    return points.length;
  }

  public async query(
    model: SeriesModel,
    query: SeriesQuery
  ): Promise<SeriesPoint[]> {
    const fields = query.fields?.length
      ? query.fields
      : Object.keys(model.fields);
    const columns = await this.columns(model);
    if (!columns) {
      return [];
    }

    const sql = selectStatement(model, query, fields, columns);
    const params = Object.fromEntries(
      query.resourceIds.map((id, i) => [`r${i}`, String(id)])
    );

    try {
      const rows: Record<string, unknown>[] = [];
      for await (const row of this.client().query(sql, databaseOf(model), {
        type: 'sql',
        params
      })) {
        rows.push(row);
      }
      return rows.map((row) => toPoint(model, query, fields, row));
    } catch (error) {
      throw unavailable('query', error);
    }
  }

  public async delete(
    _model: SeriesModel,
    _query: SeriesDeleteQuery
  ): Promise<number> {
    throw new TimeSeriesError(
      ErrorCode.TimeSeriesUnsupported,
      'InfluxDB 3 deletes no points, they are removed by the retention period of the database',
      { operation: 'delete', provider: 'influxdb' }
    );
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    try {
      await this.client().getServerVersion();
      return { success: true };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  /** @internal */
  private client(): InfluxDBClient {
    // The client requires a token, which a server without authentication ignores
    this._client ??= new InfluxDBClient({
      host: influxConfig.HOST,
      token: influxConfig.TOKEN || 'none',
      authScheme: influxConfig.AUTH_SCHEME || undefined,
      database: influxConfig.DATABASE,
      writeTimeout: influxConfig.WRITE_TIMEOUT,
      queryTimeout: influxConfig.QUERY_TIMEOUT
    });
    return this._client;
  }

  /**
   * The columns of the table of a model, or undefined before its first write. A field without a written value has
   * no column yet, so it is selected as null.
   *
   * @internal
   */
  private async columns(model: SeriesModel): Promise<Set<string> | undefined> {
    const columns = new Set<string>();
    try {
      for await (const row of this.client().query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $table`,
        databaseOf(model),
        { type: 'sql', params: { table: model.table } }
      )) {
        columns.add(String(row.column_name));
      }
    } catch (error) {
      // The database is created by the first write
      if (/not found|does not exist/i.test((error as Error).message)) {
        return undefined;
      }
      throw unavailable('query', error);
    }
    return columns.size > 0 ? columns : undefined;
  }

  /** Creates a database with a retention period, or updates the retention of an existing one. @internal */
  private async configureDatabase(
    database: string,
    retention: string
  ): Promise<void> {
    const send = async (method: 'POST' | 'PUT') => {
      try {
        return await fetch(
          new URL('/api/v3/configure/database', influxConfig.HOST),
          {
            method,
            headers: {
              'content-type': 'application/json',
              ...(influxConfig.TOKEN
                ? {
                    authorization: `${influxConfig.AUTH_SCHEME || 'Token'} ${influxConfig.TOKEN}`
                  }
                : {})
            },
            body: JSON.stringify({ db: database, retention_period: retention })
          }
        );
      } catch (error) {
        throw unavailable('database configuration', error);
      }
    };

    let response = await send('POST');
    if (response.status === 409) {
      response = await send('PUT');
    }
    if (response.status === 404) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `The InfluxDB server at ${influxConfig.HOST} cannot set the retention of the database ${database}, ` +
          'only InfluxDB 3 Core and Enterprise can: set it on the server and leave the retention of the config and ' +
          'the models empty'
      );
    }
    // Refused, i.e. the database limit of InfluxDB 3 Core (5 databases)
    if (response.status >= 400 && response.status < 500) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `The InfluxDB server refused the retention of the database ${database}: ${await response.text()}`
      );
    }
    if (!response.ok) {
      throw unavailable(
        'database configuration',
        new Error(`${response.status} ${await response.text()}`)
      );
    }
    logger.debug({ database, retention }, 'InfluxDB database retention set');
  }
}

/** The database of the points of a model, a database of its own for a model with a retention of its own. */
function databaseOf(model: SeriesModel): string {
  return model.options.retention
    ? `${influxConfig.DATABASE}_${model.table.replace(/[^A-Za-z0-9_-]/g, '_')}`
    : influxConfig.DATABASE;
}

/** The retention period of a duration, in its largest whole unit (`30d`, `12h`), as InfluxDB takes it. */
function retentionPeriod(duration: string): string {
  const seconds = parseDuration(duration);
  if (!seconds || !Number.isInteger(seconds)) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `The InfluxDB retention '${duration}' is not a duration of whole seconds, i.e. 365d`
    );
  }

  const [unit, size] =
    RETENTION_UNITS.find(([, length]) => seconds % length === 0) ??
    RETENTION_UNITS[RETENTION_UNITS.length - 1];
  return `${seconds / size}${unit}`;
}

const RETENTION_UNITS: [string, number][] = [
  ['d', 86_400],
  ['h', 3600],
  ['m', 60],
  ['s', 1]
];

/** The line of a point, or undefined for a point without a value. */
function lineProtocol(
  model: SeriesModel,
  point: SeriesPoint
): string | undefined {
  const values = Object.entries(point.values)
    .filter(
      ([field, value]) =>
        value !== null && value !== undefined && model.fields[field]
    )
    .map(
      ([field, value]) =>
        `${escapeKey(field)}=${fieldValue(model.fields[field].type, value!)}`
    );
  if (values.length === 0) {
    return undefined;
  }

  return `${escapeMeasurement(model.table)},resourceId=${escapeKey(String(point.resourceId))} ${values.join(
    ','
  )} ${point.time.getTime()}`;
}

function fieldValue(
  type: 'float' | 'int' | 'boolean',
  value: number | boolean
): string {
  if (type === 'boolean') {
    return value ? 'true' : 'false';
  }
  // A float field keeps its type when a value is whole, an integer takes the `i` suffix
  return type === 'int'
    ? `${Math.trunc(Number(value))}i`
    : String(Number(value));
}

function escapeMeasurement(name: string): string {
  return name.replace(/[,\s\\]/g, (char) => `\\${char}`);
}

function escapeKey(name: string): string {
  return name.replace(/[,=\s\\]/g, (char) => `\\${char}`);
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

const timestamp = (date: Date) => `TIMESTAMP '${date.toISOString()}'`;

/**
 * Builds the SQL query of the points of a model, the fields without a column selected as null. The ids are bound as
 * the `$r0`, `$r1`... parameters.
 */
export function selectStatement(
  model: SeriesModel,
  query: SeriesQuery,
  fields: string[],
  columns: Set<string>
): string {
  const present = fields.filter((field) => columns.has(field));
  const conditions = [
    `${quote('resourceId')} IN (${query.resourceIds.map((_, i) => `$r${i}`).join(', ')})`,
    ...(query.from ? [`time >= ${timestamp(query.from)}`] : []),
    ...(query.to ? [`time < ${timestamp(query.to)}`] : []),
    present.length
      ? `(${present.map((field) => `${quote(field)} IS NOT NULL`).join(' OR ')})`
      : 'FALSE'
  ];
  const direction = query.order === 'desc' ? 'DESC' : 'ASC';
  const tail = `ORDER BY t ${direction}, rid ASC${query.limit !== undefined ? ` LIMIT ${query.limit}` : ''}`;
  const from = `FROM ${quote(model.table)} WHERE ${conditions.join(' AND ')}`;

  if (!query.bucket && !query.aggregate) {
    const values = fields.map((field) =>
      present.includes(field) ? quote(field) : `NULL AS ${quote(field)}`
    );
    return `SELECT ${quote('resourceId')} AS rid, time AS t, ${values.join(', ')} ${from} ${tail}`;
  }

  const aggregate = query.aggregate ?? 'avg';
  const bucket = query.bucket
    ? `date_bin(INTERVAL '${query.bucket} seconds', time, TIMESTAMP '1970-01-01T00:00:00Z')`
    : undefined;
  const values = fields.map(
    (field) =>
      `${
        present.includes(field)
          ? aggregateExpression(
              aggregate,
              quote(field),
              model.fields[field].type === 'boolean'
            )
          : aggregate === 'count'
            ? '0'
            : 'NULL'
      } AS ${quote(field)}`
  );
  const groupBy = [quote('resourceId'), ...(bucket ? [bucket] : [])].join(', ');

  return `SELECT ${quote('resourceId')} AS rid, ${bucket ?? 'MIN(time)'} AS t, ${values.join(', ')} ${from} GROUP BY ${groupBy} ${tail}`;
}

function aggregateExpression(
  aggregate: SeriesAggregate,
  column: string,
  boolean: boolean
): string {
  switch (aggregate) {
    case 'count':
      return `COUNT(${column})`;
    case 'first':
      return `first_value(${column} ORDER BY time ASC) FILTER (WHERE ${column} IS NOT NULL)`;
    case 'last':
      return `last_value(${column} ORDER BY time ASC) FILTER (WHERE ${column} IS NOT NULL)`;
    default: {
      const value = boolean ? `CAST(${column} AS DOUBLE)` : column;
      return `${aggregate.toUpperCase()}(${value})`;
    }
  }
}

/** Converts a row of a query to a point. */
function toPoint(
  model: SeriesModel,
  query: SeriesQuery,
  fields: string[],
  row: Record<string, unknown>
): SeriesPoint {
  const aggregate =
    query.bucket || query.aggregate ? (query.aggregate ?? 'avg') : undefined;
  const keepsType = !aggregate || aggregate === 'first' || aggregate === 'last';

  return {
    resourceId: toId(model, row.rid),
    time: toDate(row.t),
    values: Object.fromEntries(
      fields.map((field) => [
        field,
        toValue(row[field], keepsType && model.fields[field].type === 'boolean')
      ])
    )
  };
}

function toId(model: SeriesModel, value: unknown): ResourceId {
  return model.idType === 'string' ? String(value) : Number(value);
}

/** Converts a time of a query, the nanoseconds since the epoch of the Arrow timestamps. */
function toDate(value: unknown): Date {
  if (typeof value === 'bigint') {
    return new Date(Number(value / 1_000_000n));
  }
  if (value instanceof Date) {
    return value;
  }
  return new Date(value as string | number);
}

function toValue(value: unknown, boolean: boolean): SeriesValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (boolean) {
    return value === true;
  }
  return Number(value);
}

function unavailable(operation: string, error: unknown): TimeSeriesError {
  logger.error({ err: error, operation }, 'InfluxDB request failed');
  return new TimeSeriesError(
    ErrorCode.TimeSeriesUnavailable,
    `The InfluxDB ${operation} failed: ${(error as Error).message}`,
    undefined,
    { cause: error }
  );
}
