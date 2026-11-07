import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const databaseSeriesConfig = defineConfig('timeseries.database', {
  /** How long the `database` provider keeps the points, a duration (`365d`), overridden by the
   * `seriesOptions.retention` of a model, empty to keep every point. Default: `''`. */
  RETENTION: Type.String({ default: '' }),
  /** How often the `database` provider deletes the points older than their retention, a duration. Default: `'1h'`. */
  RETENTION_INTERVAL: Type.String({ default: '1h' }),
  /** Delete the expired points in this instance, `false` for the other instances of an application whose deletes run
   * in one instance (or in a task calling `purge`). Default: `true`. */
  RETENTION_WORKER: Type.Boolean({ default: true })
});
