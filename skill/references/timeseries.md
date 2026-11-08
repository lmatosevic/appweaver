# Time series

The `series` section of a resource model declares numeric and boolean fields measured over time, i.e. the temperature
of a sensor, the price of a product, or the open tickets of a team. Their points live apart from the records of the
model, in a `TimeSeries` store, each point belonging to one resource and keyed by its time, and they are written and
queried through their own routes and the `TimeSeriesService` of `@appweaver/core`.

## Declaring series fields

```ts
import { createModel } from '@appweaver/data';

export default createModel({
  name: 'Sensor',
  scalars: {
    serial: { type: 'string', unique: true }
  },
  series: {
    temperature: { type: 'float', minimum: -50, maximum: 150, description: 'Degrees Celsius' },
    errors: { type: 'int', minimum: 0 },
    online: { type: 'boolean' }
  },
  seriesOptions: {
    ingest: 'queue', // or 'direct' / 'auto', default: the `timeseries.ingest` config
    retention: '365d', // deleted after a year
    compressAfter: '30d', // TimescaleDB: compressed after a month
    chunkInterval: '7d' // TimescaleDB: the time range of a chunk
  }
});
```

| Series field option | Description                                                   |
|---------------------|---------------------------------------------------------------|
| `type`              | `float`, `int` or `boolean`                                   |
| `minimum`           | The smallest value accepted, of a numeric field               |
| `maximum`           | The largest value accepted, of a numeric field                |
| `description`       | The description of the field in the OpenAPI specification     |
| `example`           | The example of the field in the OpenAPI specification         |

| Series option   | Description                                                                               |
|-----------------|-------------------------------------------------------------------------------------------|
| `ingest`        | `direct`, `queue` or `auto`, how the points are written (see [Ingestion](#ingestion))     |
| `tableName`     | The table of the points, default `<Model>Series` or `<tableName>_series`                  |
| `retention`     | How long the points are kept, a duration (`90d`), overriding the retention of the store: `timeseries.database.retention` or `timeseries.timescale.retention` |
| `compressAfter` | The age TimescaleDB compresses the points from, default `timeseries.timescale.compressAfter` |
| `chunkInterval` | The time range of a TimescaleDB chunk, default `timeseries.timescale.chunkInterval`       |

A field cannot be named `time` or `resourceId`, the time and the resource of a point, nor `resource` with the
`database` store (the relation of its Prisma model). The durations are a number and a unit of `ms`, `s`, `m`, `h`, `d`
or `w` (`15m`, `1h`, `7d`), of whole seconds; `createModel` rejects an invalid option at once, whatever the store.

A point carries the values of any of the fields, and a point written at the time of a stored one merges into it: the
fields it carries replace the stored ones, the others stay. So a retried write never duplicates a point. The values of
the fields a point does not carry are `null` when it is read.

`weaver generate` emits the `<Model>Series` type of the values (`SensorSeries`), registered as the `series` of the
model in the `ResourceRegistry`, so the `TimeSeriesService` types the values of `write` and `query` by the model name.

## Stores

The store is selected by `timeseries.provider`:

| Provider    | Package                | Store                                                                                     |
|-------------|------------------------|-------------------------------------------------------------------------------------------|
| `database`  | `@appweaver/data`      | The `<Model>Series` table of the database, on SQLite, PostgreSQL, MySQL and SQL Server     |
| `timescale` | `@appweaver/data`      | The same table, a TimescaleDB hypertable on PostgreSQL, with compression and retention    |
| `memory`    | `@appweaver/core`      | The process memory, for the tests                                                         |
| `none`      | —                      | No store: the `TimeSeriesService` and the series routes are left out                      |

With `auto` (the default), the driver of an enabled module package wins, otherwise `database` with `@appweaver/data`.
`timescale` and `memory` are selected by their names only. Both SQL stores take part in the transactions, delete the
points of a range, and delete the points of a resource with it by the foreign key of the table. Another store is
written as a module package, its driver tested with the [contract suite](#testing).

### database

`weaver generate` adds a table for every model with series fields to the Prisma schema: the `resourceId` and the
`time` as its primary key, a nullable column per field, and a foreign key to the resource deleting its points with it.

```prisma
model SensorSeries {
  resourceId  Int
  time        DateTime
  temperature Float?
  errors      Int?
  online      Boolean?

  /// Related columns
  resource Sensor @relation("SensorSeries", fields: [resourceId], references: [id], onDelete: Cascade)

  @@id([resourceId, time])
}
```

The model gets the `seriesPoints` relation of its points, so neither `<Model>Series` nor a `seriesPoints` field may be
declared by the application. Create the migration of the table like any other: `weaver migration new add_sensor_series`.
The buckets are computed in SQL on every database (`date_bin` on PostgreSQL, `TIMESTAMPDIFF` on MySQL, `strftime` on
SQLite, `DATEADD` on SQL Server), suited to moderate volumes; a high volume belongs in TimescaleDB. The table is left
out of the Prisma schema when another store holds the points (`memory`, `none`, a module path, or `auto` with the
module package of another store enabled). On PostgreSQL the SQL of the points names the schema of the `schema`
parameter of `database.url`, like the queries of Prisma, `public` without one.

The points older than the retention of their model (`seriesOptions.retention`, otherwise
`timeseries.database.retention`) are deleted when the application starts, then every
`timeseries.database.retentionInterval` (`1h`), a single `DELETE` per model. Every instance runs them by default,
which is safe, since a delete of the points already deleted deletes nothing, but repeats the work: run them in one
instance only with `TIMESERIES_DATABASE_RETENTION_WORKER=false` on the others. The points then wait for that instance
while it is down, and none is lost. Without any worker, a scheduled task deletes them instead:

```ts
import { TimeSeries } from '@appweaver/common';
import { inject } from '@appweaver/core';
import { DatabaseTimeSeries } from '@appweaver/data';

// i.e. a `weaver run` task, or a cron job of a single instance
const deleted = await inject<DatabaseTimeSeries>(TimeSeries as any).purge();
```

### timescale

The `database` store on PostgreSQL with the [TimescaleDB](https://www.timescale.com) extension (the
`timescale/timescaledb` image). When the application starts, it creates the extension when missing, turns every series
table into a hypertable partitioned by time (`create_hypertable`, without its default indexes, so the schema stays the
one of the Prisma migrations and `weaver migration new` sees no drift), and keeps the compression and retention policies
of each model in line with its `seriesOptions`, adding, replacing or removing them, under an advisory lock so starting
instances set them up once. The buckets use `time_bucket`.

```json
{
  "config": {
    "timeseries": {
      "provider": "timescale",
      "timescale": { "chunkInterval": "7d", "compressAfter": "30d", "retention": "365d" }
    }
  }
}
```

The database user needs the right to create the extension, or the extension is created beforehand
(`CREATE EXTENSION timescaledb`). The compression and the retention policies are features of the Timescale License,
missing from the Apache-only builds of some managed PostgreSQL services: leave `compressAfter` and `retention` empty
there.

## Ingestion

A write is validated first (the fields, their types and ranges, the times, `timeseries.maxPointsPerWrite`), so an invalid
one fails at once, then applied in one of two ways:

| Ingest   | Behavior                                                                                                    |
|----------|-------------------------------------------------------------------------------------------------------------|
| `direct` | Written in the request (the default of `timeseries.ingest`), responding `200 { count, queued: false }`      |
| `queue`  | Sent to the `timeseries.queueName` queue in jobs of up to `timeseries.queueBatchSize` points, responding `202 { count, queued: true }`, and written by a worker |
| `auto`   | Queued on a durable queue (BullMQ), written directly on the in-memory one                                  |

The worker runs in every instance with `timeseries.queueWorker` (`true` by default), `timeseries.queueConcurrency` jobs
at once, retried with the `queue.retryAttempts` and `queue.retryBackoff` of the queue. Since a point merges into the one
stored at its time, a retried job writes no duplicate. The points of a resource deleted since they were queued are
dropped, the others of the job written. `queue` with the in-memory queue loses the queued points on a restart.

A write made in a transaction (`runTransaction`, a service hook) takes part in it on the `database` and `timescale`
stores, while a queued write, or a write to a store outside the database (a driver whose `transactional` is `false`),
waits for the commit and is dropped on a rollback.

A store unreachable when the application starts is set up by the next write or query (the hypertables of
TimescaleDB), and a failed retention delete is logged and run again at the next interval, while an invalid setup (a
retention that is not a duration) fails the start with `CONFIGURATION_INVALID`.

## Routes

`createRoutes` registers the series routes of a model with series fields, configured by `seriesWrite`, `seriesQuery`
and `seriesDelete` (`exclude`, `roles`, `public`, `rateLimit`, ...):

| Route                         | Config         | Description                                                                 |
|-------------------------------|----------------|-----------------------------------------------------------------------------|
| `POST /:id/series`            | `seriesWrite`  | Writes the points of a resource: `{ points: [{ time?, ...values }] }`        |
| `POST /series`                | `seriesWrite`  | Writes the points of many resources: `{ points: [{ resourceId, time?, ...values }] }` |
| `GET /:id/series`             | `seriesQuery`  | Queries the points of a resource                                            |
| `POST /series/query`          | `seriesQuery`  | Queries the points of the resources of the `ids`, the `filter`, or both     |
| `POST /:id/delete-series`     | `seriesDelete` | Deletes the points of a resource within `{ from?, to? }`, all without them   |

```ts
export default createRoutes({
  modelName: 'Sensor',
  seriesWrite: { auth: [AuthType.ApiKey], maxPoints: 1000, allowDirect: false },
  seriesQuery: { roles: ['Analyst'] },
  seriesDelete: { exclude: true }
});
```

`seriesWrite` takes `maxPoints` (default `timeseries.maxPointsPerWrite`) and `allowDirect`: a write with
`?ingest=direct` skips the queue of a model queueing its points, unless `allowDirect: false`. A point's `time` is an ISO
8601 string or the milliseconds since the epoch, now by default.

The query parameters (the body of `POST /series/query`):

| Parameter   | Description                                                                                      |
|-------------|--------------------------------------------------------------------------------------------------|
| `fields`    | The fields to return, comma separated in the query string (an array in a body), all by default  |
| `from`      | The start of the range, inclusive                                                                |
| `to`        | The end of the range, exclusive                                                                  |
| `bucket`    | A duration (`15m`, `1h`, `1d`) aggregating the points of each bucket, aligned to the Unix epoch  |
| `aggregate` | `avg` (the default with a bucket), `min`, `max`, `sum`, `count`, `first`, `last`                 |
| `order`     | `asc` (default) or `desc`, by time                                                               |
| `limit`     | The maximum number of points, at most `timeseries.maxPointsPerQuery`                             |

```bash
GET /api/sensors/7/series?fields=temperature&from=2026-01-01T00:00:00Z&bucket=1h&aggregate=max
# { "items": [{ "time": "2026-01-01T00:00:00.000Z", "temperature": 21.4 }, ...] }

POST /api/sensors/series/query
{ "filter": { "serial": { "_starts": "EU-" } }, "fields": ["errors"], "bucket": "1d", "aggregate": "sum" }
# { "items": [{ "resourceId": 7, "time": "2026-01-01T00:00:00.000Z", "errors": 3 }, ...] }
```

The aggregates skip the null values, so `first` and `last` are the first and last values of each field in the bucket,
and `count` the number of its values. `avg`, `min`, `max` and `sum` count a boolean as `1` or `0`, so the `avg` of a
boolean is the share of `true` (a number in the response). An aggregate without a bucket returns one point per
resource, at the time of its first point. A bucket without any point is left out, and so is a point without a value of
the selected fields.

### Access

Every route reads the resources through their resource service first, so the policy of the model applies (a resource
it cannot read is `RESOURCE_NOT_FOUND`), then checks the `series` of the policy, each check allowing the action when
left out:

```ts
export default createPolicy({
  modelName: 'Sensor',
  series: {
    canRead: (user, sensor) => sensor.ownerId === user?.id,
    canWrite: (user) => hasRole(user, 'Device'),
    canDelete: () => false
  }
});
```

A frequent writer is checked on every request unless `timeseries.accessCacheTtl` keeps an allowed check for that many
milliseconds. A query or a write of many covers up to `timeseries.maxResourcesPerQuery` resources.

## TimeSeriesService

```ts
import { inject, TimeSeriesService } from '@appweaver/core';

const timeSeries = inject(TimeSeriesService);

await timeSeries.write('Sensor', [
  { resourceId: 7, values: { temperature: 21.5, online: true } }, // now
  { resourceId: 7, time: '2026-01-01T12:00:00Z', values: { errors: 2 } }
]);
await timeSeries.write('Sensor', points, { ingest: 'direct' });

const hourly = await timeSeries.query('Sensor', {
  resourceIds: [7],
  fields: ['temperature'],
  from: new Date(Date.now() - 86_400_000),
  bucket: '1h',
  aggregate: 'avg'
});
// [{ resourceId: 7, time: Date, values: { temperature: 21.2 } }, ...]

await timeSeries.delete('Sensor', { resourceIds: [7], to: '2026-01-01T00:00:00Z' });
```

The service checks no policy, like the resource services called by the application. Its `normalizePoints` and
`normalizeQuery` validate the input the way the routes do. The `TimeSeriesService` is defined only when a store is
provided, so `inject(TimeSeriesService, false)` is `undefined` with `timeseries.provider: none`.

## Limitations

- The buckets have a fixed width in UTC, so no time zones or calendar months. A point has millisecond precision.
- An `int` field is 32 bits, and a value is read as a JavaScript number, so a total past 2^53 loses precision.
- A `null` value never clears a stored one, delete the point instead.
- While the queue is down a queued write responds `503`, and a write from an event handler is lost unless it handles
  the error.
- A soft deleted resource keeps its points until their retention, unreachable through the routes.
- TimescaleDB: the retention drops whole chunks, and the type of a field cannot change once a chunk is compressed.

## Testing

Select the `memory` store in the `test` environment, unless the end-to-end tests run on the store of production:

```json
{ "environments": { "test": { "timeseries": { "provider": "memory" } } } }
```

A driver of another store runs the contract suite of `@appweaver/testing`:

```ts
import { contractSeriesModel, testTimeSeriesContract } from '@appweaver/testing';

// The store creates the table of contractSeriesModel when it needs one
testTimeSeriesContract('QuestTimeSeries', () => new QuestTimeSeries());
```

## Scaffolding

`npm create @appweaver my-app -- --add timeseries` (or `weaver module add timeseries`) selects the `database` provider,
`timescale` on PostgreSQL, whose docker-compose service then runs the TimescaleDB image.
