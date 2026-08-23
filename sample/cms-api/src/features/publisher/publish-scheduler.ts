import { inject } from '@appweaver/core';
import { CronScheduler } from '@appweaver/core/scheduler/cron-scheduler';
import { logger, Scheduler } from '@appweaver/common';
import { publishScheduledPosts } from '@/features/publisher/publish';

// Every minute, so a scheduled post goes live without an editor
inject<CronScheduler>(Scheduler).addJob({
  cronTime: '0 * * * * *',
  onTick: async () => {
    const published = await publishScheduledPosts();
    if (published > 0) {
      logger.info(`Scheduled posts published: ${published}`);
    }
  }
});
