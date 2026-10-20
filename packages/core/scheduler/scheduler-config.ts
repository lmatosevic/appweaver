import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const schedulerConfig = defineConfig('scheduler', {
  /** Enable the scheduler, disable it when the `cron` package is not installed. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Auto-start scheduled jobs on application startup. Default: `true`. */
  AUTO_START_JOB: Type.Boolean({ default: true }),
  /** Scheduler provider implementation path. Default: `'@appweaver/core/scheduler/cron-scheduler'`. */
  PROVIDER: Type.String({
    default: '@appweaver/core/scheduler/cron-scheduler'
  })
});
