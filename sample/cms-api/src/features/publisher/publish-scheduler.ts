import { inject, Scheduler } from '@appweaver/core';
import { logger } from '@appweaver/common';
import { publishPosts } from '@/features/publisher/publish';

inject(Scheduler).addJob({
  cronTime: '*/30 * * * * *',
  onTick: async () => {
    const count = await publishPosts();
    logger.info(`Posts to publish: ${count}`);
  }
});
