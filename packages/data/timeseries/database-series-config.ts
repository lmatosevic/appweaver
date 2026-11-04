import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const databaseSeriesConfig = defineConfig('timeseries.database', {
  /** How long the `database` provider keeps the points, a duration (`365d`), overridden by the
   * `seriesOptions.retention` of a model, empty to keep every point. Default: `''`. */
  RETENTION: Type.String({ default: '' }),
  /** How often the `database` provider deletes the points older than their retention, a duration (`1h`), empty to
   * delete none (i.e. deleted by a task calling `purge`). Default: `'1h'`. */
  RETENTION_INTERVAL: Type.String({ default: '1h' })
});
