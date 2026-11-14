import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const httpTelemetryConfig = defineConfig('telemetry.http', {
  /** URL paths of the requests left out of the traces and the metrics: an exact path, or a prefix ending with `*`,
   * i.e. `['/public/*', '/favicon.ico']`. Default: `[]`. */
  IGNORE_PATHS: Type.Array(Type.String(), { default: [] }),
  /** Trace and measure the requests of the health check routes. Default: `false`. */
  HEALTH_CHECK: Type.Boolean({ default: false })
});
