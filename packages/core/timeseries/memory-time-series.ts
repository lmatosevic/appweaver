import {
  HealthCheckResult,
  ResourceId,
  SeriesAggregate,
  SeriesDeleteQuery,
  SeriesModel,
  SeriesPoint,
  SeriesQuery,
  SeriesValue,
  TimeSeries
} from '@appweaver/common';

type StoredValues = Record<string, SeriesValue>;

/** The points of a table, by resource id and time in milliseconds. */
type Table = Map<
  string,
  { resourceId: ResourceId; points: Map<number, StoredValues> }
>;

/**
 * The in-process `memory` driver of `TimeSeries`, for the tests and the development. The points are lost on a
 * restart.
 */
export class MemoryTimeSeries extends TimeSeries {
  /** @internal */
  private readonly _tables = new Map<string, Table>();

  public async onInit(): Promise<void> {}

  public async onDestroy(): Promise<void> {
    this._tables.clear();
  }

  public async register(models: SeriesModel[]): Promise<void> {
    for (const model of models) {
      this.table(model);
    }
  }

  public async write(
    model: SeriesModel,
    points: SeriesPoint[]
  ): Promise<number> {
    const table = this.table(model);
    for (const point of points) {
      const key = String(point.resourceId);
      const series = table.get(key) ?? {
        resourceId: point.resourceId,
        points: new Map()
      };
      table.set(key, series);

      const time = point.time.getTime();
      const stored = series.points.get(time) ?? {};
      for (const [field, value] of Object.entries(point.values)) {
        if (value !== undefined && value !== null) {
          stored[field] = value;
        }
      }
      series.points.set(time, stored);
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
    const rows = this.select(model, query, fields);

    const points =
      query.bucket || query.aggregate
        ? this.aggregate(
            model,
            rows,
            fields,
            query.aggregate ?? 'avg',
            query.bucket
          )
        : rows.map((row) => ({
            resourceId: row.resourceId,
            time: new Date(row.time),
            values: Object.fromEntries(
              fields.map((field) => [field, row.values[field] ?? null])
            )
          }));

    const direction = query.order === 'desc' ? -1 : 1;
    points.sort(
      (a, b) =>
        direction * (a.time.getTime() - b.time.getTime()) ||
        String(a.resourceId).localeCompare(String(b.resourceId), undefined, {
          numeric: true
        })
    );

    return query.limit !== undefined ? points.slice(0, query.limit) : points;
  }

  public async delete(
    model: SeriesModel,
    query: SeriesDeleteQuery
  ): Promise<number> {
    const table = this.table(model);
    let count = 0;
    for (const resourceId of query.resourceIds) {
      const series = table.get(String(resourceId));
      for (const time of series?.points.keys() ?? []) {
        if (inRange(time, query.from, query.to)) {
          series!.points.delete(time);
          count++;
        }
      }
    }
    return count;
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }

  /** @internal */
  private table(model: SeriesModel): Table {
    let table = this._tables.get(model.table);
    if (!table) {
      table = new Map();
      this._tables.set(model.table, table);
    }
    return table;
  }

  /** The stored points of a query in its range, skipping the ones without a value of the selected fields. @internal */
  private select(
    model: SeriesModel,
    query: SeriesQuery,
    fields: string[]
  ): { resourceId: ResourceId; time: number; values: StoredValues }[] {
    const table = this.table(model);
    const rows: {
      resourceId: ResourceId;
      time: number;
      values: StoredValues;
    }[] = [];

    for (const resourceId of query.resourceIds) {
      const series = table.get(String(resourceId));
      for (const [time, values] of series?.points ?? []) {
        if (
          inRange(time, query.from, query.to) &&
          fields.some((field) => values[field] !== undefined)
        ) {
          rows.push({ resourceId: series!.resourceId, time, values });
        }
      }
    }

    return rows.sort((a, b) => a.time - b.time);
  }

  /** Aggregates the points of each resource by bucket, or over the whole range without a bucket. @internal */
  private aggregate(
    model: SeriesModel,
    rows: { resourceId: ResourceId; time: number; values: StoredValues }[],
    fields: string[],
    aggregate: SeriesAggregate,
    bucket?: number
  ): SeriesPoint[] {
    const groups = new Map<
      string,
      { resourceId: ResourceId; time: number; rows: StoredValues[] }
    >();
    const width = bucket ? bucket * 1000 : 0;

    for (const row of rows) {
      const start = width ? Math.floor(row.time / width) * width : undefined;
      const key = `${row.resourceId}|${start ?? ''}`;
      const group = groups.get(key) ?? {
        resourceId: row.resourceId,
        time: start ?? row.time,
        rows: []
      };
      groups.set(key, group);
      group.rows.push(row.values);
    }

    return [...groups.values()].map((group) => ({
      resourceId: group.resourceId,
      time: new Date(group.time),
      values: Object.fromEntries(
        fields.map((field) => [
          field,
          aggregateValues(
            group.rows
              .map((values) => values[field])
              .filter((v) => v !== undefined && v !== null),
            aggregate,
            model.fields[field]?.type === 'boolean'
          )
        ])
      )
    }));
  }
}

function inRange(time: number, from?: Date, to?: Date): boolean {
  return (!from || time >= from.getTime()) && (!to || time < to.getTime());
}

/** Aggregates the values of a field, in time order, the booleans counted as `1` and `0` but by `first` and `last`. */
function aggregateValues(
  values: SeriesValue[],
  aggregate: SeriesAggregate,
  boolean: boolean
): SeriesValue {
  if (aggregate === 'count') {
    return values.length;
  }
  if (values.length === 0) {
    return null;
  }
  if (aggregate === 'first') {
    return values[0];
  }
  if (aggregate === 'last') {
    return values[values.length - 1];
  }

  const numbers = values.map((value) =>
    boolean ? (value ? 1 : 0) : (value as number)
  );
  switch (aggregate) {
    case 'min':
      return numbers.reduce((min, value) => Math.min(min, value));
    case 'max':
      return numbers.reduce((max, value) => Math.max(max, value));
    case 'sum':
      return numbers.reduce((sum, value) => sum + value, 0);
    default:
      return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }
}
