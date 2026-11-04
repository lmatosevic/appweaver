import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const influxConfig = defineConfig('timeseries.influxdb', {
  /** URL of the InfluxDB 3 server. Default: `'http://localhost:8181'`. */
  HOST: Type.String({ default: 'http://localhost:8181' }),
  /** Authentication token, empty for a server started without authentication. Default: `''`. */
  TOKEN: Type.String({ default: '', secret: true }),
  /** Scheme of the token: `Bearer` for InfluxDB 3 Core and Enterprise, empty for InfluxDB Cloud. Default:
   * `'Bearer'`. */
  AUTH_SCHEME: Type.String({ default: 'Bearer' }),
  /** Database the points are written to, created by the server on the first write. Default: `'appweaver'`. */
  DATABASE: Type.String({ default: 'appweaver' }),
  /** Retention period of the database, a duration (`365d`), set when the application starts, empty to leave the
   * retention of the database as it is. A model with its own `seriesOptions.retention` gets a database of its own,
   * `<database>_<table>`, with that retention instead. Default: `''`. */
  RETENTION: Type.String({ default: '' }),
  /** Maximum time in milliseconds of a write. Default: `10000` (10 sec). */
  WRITE_TIMEOUT: Type.Integer({ default: 10000, minimum: 1 }),
  /** Maximum time in milliseconds of a query. Default: `60000` (1 min). */
  QUERY_TIMEOUT: Type.Integer({ default: 60000, minimum: 1 })
});
