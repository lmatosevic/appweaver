import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const queueConfig = defineConfig('queue', {
  /** Number of completed jobs to retain in the queue. Default: `0`. */
  KEEP_COMPLETED_COUNT: Type.Integer({ default: 0 }),
  /** Time to keep completed jobs in seconds. */
  KEEP_COMPLETED_SECONDS: Type.Optional(Type.Integer()),
  /** Number of failed jobs to retain in the queue. Default: `50`. */
  KEEP_FAILED_COUNT: Type.Integer({ default: 50 }),
  /** Time to keep failed jobs in seconds. */
  KEEP_FAILED_SECONDS: Type.Optional(Type.Integer()),
  /** Number of retry attempts for failed jobs. Default: `3`. */
  RETRY_ATTEMPTS: Type.Integer({ default: 3 }),
  /** Initial backoff delay between retries in milliseconds. Default: `3000` (3 sec). */
  RETRY_BACKOFF: Type.Integer({ default: 3000 }),
  /** Retry backoff type. Values: `fixed`, `exponential`. Default: `'fixed'`. */
  RETRY_BACKOFF_TYPE: Type.Enum(
    { fixed: 'fixed', exponential: 'exponential' },
    {
      default: 'fixed'
    }
  ),
  /** Queue provider: `auto` (`bullmq` when its module is enabled, otherwise `memory`), `memory`, `bullmq`, `none`,
   * or the module path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
