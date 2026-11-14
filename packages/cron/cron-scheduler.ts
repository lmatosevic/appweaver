import { CronJob } from 'cron';
import {
  DURATION_BUCKETS,
  JobParams,
  createLogger,
  recordDuration,
  Scheduler,
  spanErrorType,
  telemetryEnabled,
  telemetryHistogram,
  uuid,
  withSpan
} from '@appweaver/common';
import { schedulerConfig } from '@appweaver/core';

const logger = createLogger('scheduler');

const jobDuration = telemetryHistogram('appweaver.scheduler.job.duration', {
  description: 'Duration of the runs of the scheduled jobs.',
  unit: 's',
  advice: { explicitBucketBoundaries: DURATION_BUCKETS }
});

export class CronScheduler extends Scheduler<CronJob> {
  /** @internal */
  private readonly _jobs: Record<string, CronJob> = {};

  public async onDestroy(): Promise<void> {
    await this.stopAll();
  }

  public startAll(): void {
    for (const job of Object.values(this._jobs)) {
      if (!job.isActive) {
        job.start();
      }
    }
  }

  public async stopAll(): Promise<void> {
    const stopActions: Promise<void>[] = [];

    for (const job of Object.values(this._jobs)) {
      if (!job.isActive) {
        continue;
      }
      const stopAction = job.stop();
      if (stopAction) {
        stopActions.push(stopAction);
      }
    }

    await Promise.allSettled(stopActions);
  }

  public addJob(jobParams: JobParams): string {
    const { cronTime, onTick, timeZone, name, providerOptions } = jobParams;
    const jobId = uuid();
    this._jobs[jobId] = CronJob.from({
      start: schedulerConfig.AUTO_START_JOB,
      waitForCompletion: true,
      errorHandler: (e) => {
        logger.error({ err: e, jobId, name }, 'Job handler error');
      },
      ...providerOptions,
      cronTime,
      onTick: async () => {
        const start = performance.now();
        logger.debug({ jobId, name }, 'Job run started');
        await runTraced(jobId, jobParams);
        logger.debug(
          { jobId, name, durationMs: Math.round(performance.now() - start) },
          'Job run finished'
        );
      },
      timeZone
    });
    logger.debug(
      {
        jobId,
        name,
        cronTime,
        timeZone,
        nextRun: this._jobs[jobId].nextDate().toISO()
      },
      'Job scheduled'
    );
    return jobId;
  }

  public getJob(jobId: string): CronJob | undefined {
    return this._jobs[jobId];
  }

  public startJob(jobId: string): boolean {
    const job = this._jobs[jobId];
    if (!job) {
      return false;
    }

    job.start();
    logger.debug({ jobId }, 'Job started');

    return true;
  }

  public async stopJob(jobId: string): Promise<boolean> {
    const job = this._jobs[jobId];
    if (!job) {
      return false;
    }

    await job.stop();
    logger.debug({ jobId }, 'Job stopped');

    return true;
  }

  public async removeJob(jobId: string): Promise<boolean> {
    const job = this._jobs[jobId];
    if (!job) {
      return false;
    }

    await job.stop();

    delete this._jobs[jobId];
    logger.debug({ jobId }, 'Job removed');

    return true;
  }
}

/** Runs a tick of a job in the root span of a new trace, measuring its duration. */
async function runTraced(jobId: string, job: JobParams): Promise<void> {
  if (!telemetryEnabled('scheduler')) {
    await job.onTick();
    return;
  }
  const name = job.name ?? jobId;
  const start = performance.now();
  let failure: string | undefined;
  try {
    await withSpan(
      `scheduler ${job.name ?? 'job'}`,
      {
        root: true,
        attributes: {
          'appweaver.scheduler.job.id': jobId,
          'appweaver.scheduler.job.name': name,
          ...(typeof job.cronTime === 'string'
            ? { 'appweaver.scheduler.job.cron': job.cronTime }
            : {})
        }
      },
      async () => job.onTick()
    );
  } catch (error) {
    failure = spanErrorType(error);
    throw error;
  } finally {
    // A job without a name is measured as one series, its id being random
    recordDuration(jobDuration(), start, {
      ...(job.name ? { 'appweaver.scheduler.job.name': job.name } : {}),
      ...(failure ? { 'error.type': failure } : {})
    });
  }
}
