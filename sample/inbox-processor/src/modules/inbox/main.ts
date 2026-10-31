import { createLogger } from '@appweaver/common';
import { entryQueue } from './entries';
import { processEntry } from './process-entry';

const logger = createLogger('inbox');

// Two entries processed at once, an error retried by the queue
entryQueue().addWorker(
  async (job) => {
    await processEntry(job.data.entryId);
  },
  { concurrency: 2 }
);

entryQueue().onFailed((job, err) => {
  logger.debug(
    { entryId: job?.data.entryId, error: err.message },
    'Attempt failed'
  );
});
