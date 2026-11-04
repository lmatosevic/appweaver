import { empty, join, raw, Sql, sqltag } from '@prisma/client/runtime/client';
import {
  DatabaseType,
  ResourceId,
  SeriesAggregate,
  SeriesField,
  SeriesModel,
  SeriesPoint,
  SeriesQuery,
  SeriesValue
} from '@appweaver/common';

/** The SQL of a database the time series queries differ in. */
export type SeriesDialect = {
  /** The most parameters a statement binds */
  maxParams: number;
  /** Quotes an identifier */
  quote: (name: string) => string;
  /** The start of the bucket of `width` seconds holding the time column, aligned to the Unix epoch */
  bucket: (column: string, width: number) => string;
  /** A boolean or numeric column as a number */
  numeric: (column: string, field: SeriesField) => string;
  /** The argument of `AVG`, computed in floating point */
  average: (column: string) => string;
  /** Limits the rows of an ordered query */
  limit: (count: number) => string;
  /** Writes the rows of the columns, merging a row into the stored one of the same resource and time */
  upsert: (
    table: string,
    columns: string[],
    fields: string[],
    rows: Sql
  ) => Sql;
};

const ansiQuote = (name: string) => `"${name.replace(/"/g, '""')}"`;

const toInteger = (column: string, field: SeriesField) =>
  field.type === 'boolean' ? `CAST(${column} AS INTEGER)` : column;

const conflictUpsert = (
  table: string,
  columns: string[],
  fields: string[],
  rows: Sql
) =>
  sqltag`INSERT INTO ${raw(ansiQuote(table))} (${raw(columns.map(ansiQuote).join(', '))}) VALUES ${rows} ON CONFLICT (${raw(
    `${ansiQuote('resourceId')}, ${ansiQuote('time')}`
  )}) ${raw(
    fields.length
      ? `DO UPDATE SET ${fields
          .map(
            (field) =>
              `${ansiQuote(field)} = COALESCE(excluded.${ansiQuote(field)}, ${ansiQuote(table)}.${ansiQuote(field)})`
          )
          .join(', ')}`
      : 'DO NOTHING'
  )}`;

export const postgresDialect: SeriesDialect = {
  maxParams: 30_000,
  quote: ansiQuote,
  bucket: (column, width) =>
    `date_bin(INTERVAL '${width} seconds', ${column}, TIMESTAMP '1970-01-01 00:00:00')`,
  numeric: toInteger,
  average: (column) => column,
  limit: (count) => `LIMIT ${count}`,
  upsert: conflictUpsert
};

export const sqliteDialect: SeriesDialect = {
  maxParams: 9_999,
  quote: ansiQuote,
  // The times are stored as ISO 8601 text with a `+00:00` offset, the bucket written back the same way
  bucket: (column, width) =>
    `strftime('%Y-%m-%dT%H:%M:%S.000+00:00', (CAST(strftime('%s', ${column}) AS INTEGER) / ${width}) * ${width}, 'unixepoch')`,
  numeric: (column) => column,
  average: (column) => column,
  limit: (count) => `LIMIT ${count}`,
  upsert: conflictUpsert
};

const mysqlQuote = (name: string) => `\`${name.replace(/`/g, '``')}\``;

export const mysqlDialect: SeriesDialect = {
  maxParams: 30_000,
  quote: mysqlQuote,
  // Computed apart from the time zone of the session, unlike UNIX_TIMESTAMP
  bucket: (column, width) =>
    `TIMESTAMPADD(SECOND, FLOOR(TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', ${column}) / ${width}) * ${width}, '1970-01-01 00:00:00')`,
  numeric: (column, field) =>
    field.type === 'boolean' ? `CAST(${column} AS SIGNED)` : column,
  average: (column) => column,
  limit: (count) => `LIMIT ${count}`,
  upsert: (table, columns, fields, rows) =>
    sqltag`INSERT INTO ${raw(mysqlQuote(table))} (${raw(columns.map(mysqlQuote).join(', '))}) VALUES ${rows} ON DUPLICATE KEY UPDATE ${raw(
      (fields.length ? fields : ['time'])
        .map((field) =>
          field === 'time'
            ? `${mysqlQuote(field)} = ${mysqlQuote(field)}`
            : `${mysqlQuote(field)} = COALESCE(VALUES(${mysqlQuote(field)}), ${mysqlQuote(field)})`
        )
        .join(', ')
    )}`
};

const mssqlQuote = (name: string) => `[${name.replace(/]/g, ']]')}]`;

export const mssqlDialect: SeriesDialect = {
  maxParams: 2_000,
  quote: mssqlQuote,
  bucket: (column, width) => {
    const start = `(DATEDIFF_BIG(SECOND, CAST('1970-01-01' AS DATETIME2), ${column}) / ${width} * ${width})`;
    return `DATEADD(SECOND, CAST(${start} % 86400 AS INT), DATEADD(DAY, CAST(${start} / 86400 AS INT), CAST('1970-01-01' AS DATETIME2)))`;
  },
  numeric: (column, field) =>
    field.type === 'boolean' ? `CAST(${column} AS INT)` : column,
  average: (column) => `CAST(${column} AS FLOAT)`,
  limit: (count) => `OFFSET 0 ROWS FETCH NEXT ${count} ROWS ONLY`,
  upsert: (table, columns, fields, rows) => {
    const quoted = columns.map(mssqlQuote);
    const update = fields.length
      ? `WHEN MATCHED THEN UPDATE SET ${fields
          .map(
            (field) =>
              `t.${mssqlQuote(field)} = COALESCE(s.${mssqlQuote(field)}, t.${mssqlQuote(field)})`
          )
          .join(', ')} `
      : '';
    return sqltag`MERGE INTO ${raw(mssqlQuote(table))} AS t USING (VALUES ${rows}) AS s (${raw(quoted.join(', '))}) ON ${raw(
      `t.${mssqlQuote('resourceId')} = s.${mssqlQuote('resourceId')} AND t.${mssqlQuote('time')} = s.${mssqlQuote('time')}`
    )} ${raw(update)}WHEN NOT MATCHED THEN INSERT (${raw(quoted.join(', '))}) VALUES (${raw(
      quoted.map((column) => `s.${column}`).join(', ')
    )});`;
  }
};

/**
 * Returns the SQL dialect of the time series of a database.
 *
 * @param {DatabaseType} type - The database type.
 * @return {SeriesDialect} The dialect.
 */
export function seriesDialect(type: DatabaseType): SeriesDialect {
  switch (type) {
    case DatabaseType.PostgreSQL:
      return postgresDialect;
    case DatabaseType.MySQL:
      return mysqlDialect;
    case DatabaseType.SQLServer:
      return mssqlDialect;
    default:
      return sqliteDialect;
  }
}

/**
 * Builds the statements writing the points of a model, each binding up to the parameters the database allows.
 *
 * @param {SeriesDialect} dialect - The SQL dialect.
 * @param {SeriesModel} model - The series model.
 * @param {SeriesPoint[]} points - The points, at most one per resource and time.
 * @return {Sql[]} The statements.
 */
export function upsertStatements(
  dialect: SeriesDialect,
  model: SeriesModel,
  points: SeriesPoint[]
): Sql[] {
  const fields = Object.keys(model.fields);
  const columns = ['resourceId', 'time', ...fields];
  const rowsPerStatement = Math.max(
    1,
    Math.floor(dialect.maxParams / columns.length)
  );

  const statements: Sql[] = [];
  for (let i = 0; i < points.length; i += rowsPerStatement) {
    const rows = points
      .slice(i, i + rowsPerStatement)
      .map(
        (point) =>
          sqltag`(${join([
            point.resourceId,
            point.time,
            ...fields.map((field) => point.values[field] ?? null)
          ])})`
      );
    statements.push(dialect.upsert(model.table, columns, fields, join(rows)));
  }
  return statements;
}

/** The conditions of the resources and the time range of a query. */
function rangeConditions(
  dialect: SeriesDialect,
  query: Pick<SeriesQuery, 'resourceIds' | 'from' | 'to'>
): Sql[] {
  const q = dialect.quote;
  return [
    sqltag`${raw(q('resourceId'))} IN (${join(query.resourceIds)})`,
    query.from ? sqltag`${raw(q('time'))} >= ${query.from}` : empty,
    query.to ? sqltag`${raw(q('time'))} < ${query.to}` : empty
  ].filter((condition) => condition !== empty);
}

/**
 * Builds the query of the points of a model: the stored points, or the points aggregated by bucket, or over the whole
 * range of each resource without one. The points without a value of the selected fields are skipped.
 *
 * @param {SeriesDialect} dialect - The SQL dialect.
 * @param {SeriesModel} model - The series model.
 * @param {SeriesQuery} query - The normalized query, its fields selected.
 * @param {Function} [bucket] - Builds the bucket start of a time column, the one of the dialect by default.
 * @return {Sql} The query, its columns `rid`, `t` and the fields.
 */
export function selectStatement(
  dialect: SeriesDialect,
  model: SeriesModel,
  query: SeriesQuery,
  bucket: (column: string, width: number) => string = dialect.bucket
): Sql {
  const q = dialect.quote;
  const fields = query.fields?.length
    ? query.fields
    : Object.keys(model.fields);
  const where = join(
    [
      ...rangeConditions(dialect, query),
      raw(`(${fields.map((field) => `${q(field)} IS NOT NULL`).join(' OR ')})`)
    ],
    ' AND '
  );
  const direction = query.order === 'desc' ? 'DESC' : 'ASC';
  const limit = query.limit !== undefined ? dialect.limit(query.limit) : '';
  const orderBy = (time: string, rid: string) =>
    `ORDER BY ${time} ${direction}, ${rid} ASC ${limit}`;
  const order = orderBy(q('t'), q('rid'));
  const table = raw(q(model.table));

  if (!query.bucket && !query.aggregate) {
    const columns = [
      `${q('resourceId')} AS ${q('rid')}`,
      `${q('time')} AS ${q('t')}`,
      ...fields.map(q)
    ];
    return sqltag`SELECT ${raw(columns.join(', '))} FROM ${table} WHERE ${where} ${raw(order)}`;
  }

  const aggregate = query.aggregate ?? 'avg';
  const bucketColumn = query.bucket
    ? bucket(q('time'), query.bucket)
    : undefined;

  if (aggregate === 'first' || aggregate === 'last') {
    // Ordered by the expressions, since SQL Server does not order a join by an alias
    const k = (column: string) => `${q('k')}.${q(column)}`;
    return firstOrLastStatement(
      dialect,
      fields,
      aggregate,
      where,
      table,
      bucketColumn,
      orderBy(k(bucketColumn ? 'b' : 'mt'), k('rid'))
    );
  }

  const columns = [
    `${q('resourceId')} AS ${q('rid')}`,
    `${bucketColumn ?? `MIN(${q('time')})`} AS ${q('t')}`,
    ...fields.map(
      (field) =>
        `${aggregateExpression(dialect, aggregate, q(field), model.fields[field])} AS ${q(field)}`
    )
  ];
  const groupBy = [
    q('resourceId'),
    ...(bucketColumn ? [bucketColumn] : [])
  ].join(', ');

  return sqltag`SELECT ${raw(columns.join(', '))} FROM ${table} WHERE ${where} ${raw(
    `GROUP BY ${groupBy} ${order}`
  )}`;
}

/**
 * The first or last value of each field in a bucket, ignoring the points without one, with a window function per
 * field, which every supported database has.
 */
function firstOrLastStatement(
  dialect: SeriesDialect,
  fields: string[],
  aggregate: 'first' | 'last',
  where: Sql,
  table: Sql,
  bucketColumn: string | undefined,
  order: string
): Sql {
  const q = dialect.quote;
  const direction = aggregate === 'first' ? 'ASC' : 'DESC';
  const source = [
    `${q('resourceId')} AS ${q('rid')}`,
    `${bucketColumn ?? '0'} AS ${q('b')}`,
    `${q('time')} AS ${q('time')}`,
    ...fields.map(q)
  ].join(', ');

  const joins = fields.map((field, i) => {
    const alias = q(`j${i}`);
    return (
      `LEFT JOIN (SELECT ${q('rid')}, ${q('b')}, ${q(field)} AS ${q('v')}, ROW_NUMBER() OVER (PARTITION BY ${q('rid')}, ${q('b')} ORDER BY ${q('time')} ${direction}) AS ${q('rn')} ` +
      `FROM ${q('src')} WHERE ${q(field)} IS NOT NULL) ${alias} ` +
      `ON ${alias}.${q('rid')} = ${q('k')}.${q('rid')} AND ${alias}.${q('b')} = ${q('k')}.${q('b')} AND ${alias}.${q('rn')} = 1`
    );
  });

  const columns = [
    `${q('k')}.${q('rid')} AS ${q('rid')}`,
    `${q('k')}.${bucketColumn ? q('b') : q('mt')} AS ${q('t')}`,
    ...fields.map((field, i) => `${q(`j${i}`)}.${q('v')} AS ${q(field)}`)
  ].join(', ');

  return sqltag`WITH ${raw(q('src'))} AS (SELECT ${raw(source)} FROM ${table} WHERE ${where}) ${raw(
    `SELECT ${columns} FROM (SELECT ${q('rid')}, ${q('b')}, MIN(${q('time')}) AS ${q('mt')} FROM ${q('src')} GROUP BY ${q('rid')}, ${q('b')}) ${q('k')} ${joins.join(' ')} ${order}`
  )}`;
}

function aggregateExpression(
  dialect: SeriesDialect,
  aggregate: Exclude<SeriesAggregate, 'first' | 'last'>,
  column: string,
  field: SeriesField
): string {
  if (aggregate === 'count') {
    return `COUNT(${column})`;
  }
  const value = dialect.numeric(column, field);
  return aggregate === 'avg'
    ? `AVG(${dialect.average(value)})`
    : `${aggregate.toUpperCase()}(${value})`;
}

/**
 * Builds the statement deleting the points of a model within a time range.
 *
 * @param {SeriesDialect} dialect - The SQL dialect.
 * @param {SeriesModel} model - The series model.
 * @param {Object} query - The resources and the time range.
 * @return {Sql} The statement.
 */
export function deleteStatement(
  dialect: SeriesDialect,
  model: SeriesModel,
  query: Pick<SeriesQuery, 'resourceIds' | 'from' | 'to'>
): Sql {
  return sqltag`DELETE FROM ${raw(dialect.quote(model.table))} WHERE ${join(
    rangeConditions(dialect, query),
    ' AND '
  )}`;
}

/** The row of a time series query. */
export type SeriesRow = Record<string, unknown>;

/**
 * Converts the rows of a time series query to points, the values to the types of their fields: the numbers of a
 * database returning them as text, decimals or big integers, the booleans of one storing them as numbers, and the
 * times of one returning them as text in UTC.
 *
 * @param {SeriesModel} model - The series model.
 * @param {SeriesQuery} query - The query.
 * @param {SeriesRow[]} rows - The rows.
 * @return {SeriesPoint[]} The points.
 */
export function toSeriesPoints(
  model: SeriesModel,
  query: SeriesQuery,
  rows: SeriesRow[]
): SeriesPoint[] {
  const fields = query.fields?.length
    ? query.fields
    : Object.keys(model.fields);
  const aggregate =
    query.bucket || query.aggregate ? (query.aggregate ?? 'avg') : undefined;
  const keepsType = !aggregate || aggregate === 'first' || aggregate === 'last';

  return rows.map((row) => ({
    resourceId: toId(model, row.rid),
    time: toDate(row.t),
    values: Object.fromEntries(
      fields.map((field) => [
        field,
        toValue(row[field], keepsType && model.fields[field].type === 'boolean')
      ])
    )
  }));
}

function toId(model: SeriesModel, value: unknown): ResourceId {
  return model.idType === 'string' ? String(value) : Number(value);
}

/** Converts a time read from a database, a text without an offset being in UTC. */
export function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' && !/(Z|[+-]\d\d:?\d\d)$/.test(value)) {
    return new Date(`${value.replace(' ', 'T')}Z`);
  }
  return new Date(value as string | number);
}

function toValue(value: unknown, boolean: boolean): SeriesValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (boolean) {
    return value === true || Number(value) === 1;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (
    typeof value === 'object' &&
    typeof (value as any).toNumber === 'function'
  ) {
    return (value as any).toNumber();
  }
  return Number(value);
}
