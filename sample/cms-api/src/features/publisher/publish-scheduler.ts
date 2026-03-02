import { inject } from '@appweaver/core';
import { CronScheduler } from '@appweaver/core/scheduler/cron-scheduler';
import { logger, Scheduler } from '@appweaver/common';
import { publishPosts } from '@/features/publisher/publish';

inject<CronScheduler>(Scheduler).addJob({
  cronTime: '*/30 * * * * *',
  onTick: async () => {
    const count = await publishPosts();
    logger.info(`Posts to publish: ${count}`);
  }
});
