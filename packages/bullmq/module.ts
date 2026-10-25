import { defineModule, Queue } from '@appweaver/common';

/** The BullMQ queue, on the Redis connection of the memory. */
export default defineModule({
  name: '@appweaver/bullmq',
  requires: ['@appweaver/redis'],
  loggerNames: ['queue'],
  providers: [
    {
      contract: Queue,
      name: 'bullmq',
      load: () => import('./bull-queue')
    }
  ]
});
