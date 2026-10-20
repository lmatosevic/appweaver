import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const healthCheckConfig = defineConfig('healthCheck', {
  /** Enable the health check endpoint. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Require authentication for health check. Default: `true`. */
  AUTH: Type.Boolean({ default: true }),
  /** URL prefix for health check routes. Default: `'/health'`. */
  ROUTE_PREFIX: Type.String({ default: '/health' }),
  /** Cache TTL for the health check response in milliseconds. Default: `3000` (3 sec). */
  CACHE_TTL: Type.Integer({ default: 3000 }),
  /** List of health check instance names to include in response. */
  PICK_INSTANCES: Type.Optional(Type.Array(Type.String())),
  /** List of health check instance names to exclude from response. */
  OMIT_INSTANCES: Type.Optional(Type.Array(Type.String()))
});

export const healthConfig = defineConfig('health', {
  /** Port of the health listener of an application without a server, answering `/health/check` and
   * `/health/ready` without authentication, `0` to start none. Default: `0`. */
  PORT: Type.Integer({ default: 0 }),
  /** Host of the health listener. Default: `'0.0.0.0'`. */
  HOST: Type.String({ default: '0.0.0.0' })
});
