import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const schedulerConfig = defineConfig('scheduler', {
  /** Auto-start scheduled jobs on application startup. Default: `true`. */
  AUTO_START_JOB: Type.Boolean({ default: true }),
  /** Scheduler provider: `auto` (`cron` when its module is enabled, otherwise none), `cron`, `none`, or the module
   * path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
