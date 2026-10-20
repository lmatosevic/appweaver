import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const memoryConfig = defineConfig('memory', {
  /** Memory provider: `auto` (`redis` when its module is enabled, otherwise `memory`), `memory`, `redis`, or the
   * module path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' }),
  /** Maximum size of the in-memory store. */
  MAX_SIZE: Type.Optional(Type.String())
});

export const redisConfig = defineConfig('memory.redis', {
  /** Redis connection URL. Default: `'redis://localhost:6379/0'`. */
  URL: Type.String({ default: 'redis://localhost:6379/0' })
});
