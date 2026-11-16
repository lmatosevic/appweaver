import { defineModule, Memory, PubSub } from '@appweaver/common';
import { redisConfig, redisPubSubConfig } from './config';

/** The Redis memory, also the store of the cache, the rate limit and the BullMQ queue, and the Redis pub/sub. */
export default defineModule({
  name: '@appweaver/redis',
  config: [redisConfig, redisPubSubConfig],
  loggers: ['memory', 'pubsub'],
  providers: [
    {
      contract: Memory,
      name: 'redis',
      load: () => import('./redis-memory')
    },
    {
      contract: PubSub,
      name: 'redis',
      load: () => import('./redis-pubsub')
    }
  ]
});
