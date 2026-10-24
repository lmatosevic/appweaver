import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const redisConfig = defineConfig('memory.redis', {
  /** Redis connection URL. Default: `'redis://localhost:6379/0'`. */
  URL: Type.String({ default: 'redis://localhost:6379/0' })
});
