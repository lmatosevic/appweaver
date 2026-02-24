import { inject, Scheduler } from '@appweaver/core';
import { logger } from '@appweaver/common';
import { db } from '@db/client';

const scheduler = inject(Scheduler);

scheduler.addJob({
  cronTime: '*/30 * * * * *',
  onTick: async () => {
    const posts = await db.post.findMany({ where: { lastActivity: null } });
    logger.info(`Posts to publish: ${posts.length}`);
  }
});
