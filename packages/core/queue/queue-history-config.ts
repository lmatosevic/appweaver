import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const queueHistoryConfig = defineConfig('queue.history', {
  /** Record every job of the queues: who sent it, each attempt, its errors and the result. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Queue history provider: `auto` (`database` when `@appweaver/data` is enabled, otherwise none), `database`,
   * `none`, or the module path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' }),
  /** Keep the queue job table when the history is disabled. Default: `false`. */
  KEEP_DATABASE_TABLE: Type.Boolean({ default: false }),
  /** Store the payload of the jobs. Default: `true`. */
  STORE_DATA: Type.Boolean({ default: true }),
  /** Store the results of the jobs. Default: `true`. */
  STORE_RESULT: Type.Boolean({ default: true }),
  /** The largest payload or result stored, in bytes of JSON, a larger one is stored as `{ truncated: true, bytes }`.
   * Default: `65536` (64 KiB). */
  MAX_PAYLOAD_BYTES: Type.Integer({ default: 65536, minimum: 0 }),
  /** The queues to record, all of them when empty. Default: `[]`. */
  QUEUES: Type.Array(Type.String(), { default: [] }),
  /** The queues never recorded. Default: `[]`. */
  EXCLUDE_QUEUES: Type.Array(Type.String(), { default: [] }),
  /** Record the `file:line:column` of the code sending a job, which costs a stack trace per job. Default: `false`. */
  RECORD_CALLER_SITE: Type.Boolean({ default: false }),
  /** Days to keep the records of the finished jobs, `0` keeps them forever. Default: `30`. */
  RETENTION_DAYS: Type.Integer({ default: 30, minimum: 0 }),
  /** Seconds between the deletions of the expired records. Default: `3600` (1 hour). */
  CLEANUP_INTERVAL_SECONDS: Type.Integer({ default: 3600, minimum: 1 })
});
