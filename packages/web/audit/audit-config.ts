import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const auditRequestConfig = defineConfig('audit', {
  /** URL paths of the requests left out of the audit log: an exact path, or a prefix ending with `*`, i.e.
   * `['/api/metrics', '/api/internal/*']`. The health check, Swagger and static file routes are always left out.
   * Default: `[]`. */
  EXCLUDE_PATHS: Type.Array(Type.String(), { default: [] }),
  /** Record the JSON bodies of the requests other than the reading ones, their secrets redacted. Default: `false`. */
  REQUEST_BODY: Type.Boolean({ default: false })
});
