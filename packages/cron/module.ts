import { defineModule, Scheduler } from '@appweaver/common';

/** The cron scheduler. */
export default defineModule({
  name: '@appweaver/cron',
  loggerNames: ['scheduler'],
  providers: [
    {
      contract: Scheduler,
      name: 'cron',
      load: () => import('./cron-scheduler')
    }
  ]
});
