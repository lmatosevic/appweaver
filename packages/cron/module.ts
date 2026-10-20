import { defineModule, Scheduler } from '@appweaver/common';

/** The cron scheduler. */
export default defineModule({
  name: '@appweaver/cron',
  providers: [
    {
      contract: Scheduler,
      name: 'cron',
      load: () => import('./cron-scheduler')
    }
  ]
});
