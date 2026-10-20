import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const redisConfig = defineConfig('redis', {
  /** Redis connection URL. Default: `'redis://localhost:6379/0'`. */
  URL: Type.String({ default: 'redis://localhost:6379/0' }),
  /** Redis provider implementation path. Default: `'@appweaver/core/memory/redis'`. */
  PROVIDER: Type.String({ default: '@appweaver/core/memory/redis' })
});

export const memoryConfig = defineConfig('memory', {
  /** Maximum size of the in-memory store. */
  MAX_SIZE: Type.Optional(Type.String()),
  /** In-memory provider implementation path. Default: `'@appweaver/core/memory/in-memory'`. */
  PROVIDER: Type.String({ default: '@appweaver/core/memory/in-memory' })
});
