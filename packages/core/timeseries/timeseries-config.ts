import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const timeseriesConfig = defineConfig('timeseries', {
  /** How the points are written: `direct` in the request, `queue` by a queue worker, or `auto` on a queue only when
   * the queue is durable (not the `memory` one). A model overrides it with its `seriesOptions.ingest`.
   * Default: `'direct'`. */
  INGEST: Type.Enum(
    { direct: 'direct', queue: 'queue', auto: 'auto' },
    { default: 'direct' }
  ),
  /** Maximum number of points a write accepts. Default: `5000`. */
  MAX_POINTS_PER_WRITE: Type.Integer({ default: 5000, minimum: 1 }),
  /** Maximum number of points a query returns, and its default limit. Default: `10000`. */
  MAX_POINTS_PER_QUERY: Type.Integer({ default: 10000, minimum: 1 }),
  /** Maximum number of resources a query or a write of many resources covers. Default: `100`. */
  MAX_RESOURCES_PER_QUERY: Type.Integer({ default: 100, minimum: 1 }),
  /** Name of the queue the queued points are sent to. Default: `'timeseries'`. */
  QUEUE_NAME: Type.String({ default: 'timeseries' }),
  /** Maximum number of points of a queue job, a larger write is split into several jobs. Default: `1000`. */
  QUEUE_BATCH_SIZE: Type.Integer({ default: 1000, minimum: 1 }),
  /** Number of jobs the worker writes at once. Default: `1`. */
  QUEUE_CONCURRENCY: Type.Integer({ default: 1, minimum: 1 }),
  /** Run the worker writing the queued points in this instance, `false` for an instance only queueing them.
   * Default: `true`. */
  QUEUE_WORKER: Type.Boolean({ default: true }),
  /** How long the routes keep the result of the access check of a resource, in milliseconds, so a frequent writer is
   * not checked on every request, `0` to check every request. Default: `0`. */
  ACCESS_CACHE_TTL: Type.Integer({ default: 0, minimum: 0 }),
  /** Time series provider: `auto` (the driver of an enabled module, otherwise `database` with `@appweaver/data`),
   * `database`, `timescale`, `memory`, `none`, or the module path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
