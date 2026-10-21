import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

/** The keys of the `healthCheck` section core reads, beside the route keys of `@appweaver/web`. */
export const healthConfig = defineConfig('healthCheck', {
  /** Port of the health listener of an application without a server, answering `/health/check` and
   * `/health/ready` without authentication, `0` to start none. Default: `0`. */
  PORT: Type.Integer({ default: 0 }),
  /** Host of the health listener. Default: `'0.0.0.0'`. */
  HOST: Type.String({ default: '0.0.0.0' }),
  /** List of health check instance names to include in response. */
  PICK_INSTANCES: Type.Optional(Type.Array(Type.String())),
  /** List of health check instance names to exclude from response. */
  OMIT_INSTANCES: Type.Optional(Type.Array(Type.String()))
});
