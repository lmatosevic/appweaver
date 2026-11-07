import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const timescaleConfig = defineConfig('timeseries.timescale', {
  /** Time range of a chunk of the hypertables, a duration (`7d`), overridden by the `seriesOptions.chunkInterval` of
   * a model. Default: `'7d'`. */
  CHUNK_INTERVAL: Type.String({ default: '7d' }),
  /** Age from which the chunks are compressed, a duration (`30d`), overridden by the `seriesOptions.compressAfter` of
   * a model, empty to compress none. Default: `''`. */
  COMPRESS_AFTER: Type.String({ default: '' }),
  /** Age from which the chunks are dropped, a duration (`365d`), overridden by the `seriesOptions.retention` of a
   * model, empty to keep every point. Default: `''`. */
  RETENTION: Type.String({ default: '' }),
  /** Maximum time in milliseconds the hypertables and their policies take to set up at startup. Default: `60000`
   * (1 min). */
  SETUP_TIMEOUT: Type.Integer({ default: 60000, minimum: 1 })
});
