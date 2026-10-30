import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const redisConfig = defineConfig('memory.redis', {
  /** Redis connection URL. Default: `'redis://localhost:6379/0'`. */
  URL: Type.String({ default: 'redis://localhost:6379/0' }),
  /** Time in milliseconds a command waits for its reply before it fails, `0` waits indefinitely. Default: `200`. */
  COMMAND_TIMEOUT: Type.Integer({ default: 200, minimum: 0 }),
  /** Consecutive failed commands that open the circuit breaker, which fails the commands right away without sending
   * them to Redis, `0` disables the breaker. Default: `5`. */
  CIRCUIT_BREAKER_THRESHOLD: Type.Integer({ default: 5, minimum: 0 }),
  /** Time in milliseconds the open circuit breaker waits before letting one command through to probe Redis.
   * Default: `10000` (10 sec). */
  CIRCUIT_BREAKER_COOLDOWN: Type.Integer({ default: 10000, minimum: 0 })
});
