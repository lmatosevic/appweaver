import { defineModule, Memory } from '@appweaver/common';

/** The Redis memory, also the store of the cache, the rate limit and the BullMQ queue. */
export default defineModule({
  name: '@appweaver/redis',
  providers: [
    {
      contract: Memory,
      name: 'redis',
      load: () => import('../memory/redis-memory')
    }
  ]
});
