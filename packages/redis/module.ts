import { defineModule, Memory } from '@appweaver/common';
import { redisConfig } from './config';

/** The Redis memory, also the store of the cache, the rate limit and the BullMQ queue. */
export default defineModule({
  name: '@appweaver/redis',
  config: [redisConfig],
  loggerNames: ['memory'],
  providers: [
    {
      contract: Memory,
      name: 'redis',
      load: () => import('./redis-memory')
    }
  ]
});
