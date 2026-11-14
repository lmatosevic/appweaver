import { createLogger, Scheduler } from '@appweaver/common';
import { inject } from '@appweaver/core';
import { endSilentTrips } from './end-silent-trips';

const logger = createLogger('trips');

// Every five minutes, so a trip whose tracker went silent (a tunnel, a dead
// battery, a removed tracker) does not stay active forever
inject(Scheduler).addJob({
  cronTime: '*/5 * * * *',
  onTick: async () => {
    const ended = await endSilentTrips();
    if (ended > 0) {
      logger.info(`Trips ended without a signal: ${ended}`);
    }
  }
});
