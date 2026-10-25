import { CronJob } from 'cron';
import { JobParams, createLogger, Scheduler, uuid } from '@appweaver/common';
import { schedulerConfig } from '@appweaver/core';

const logger = createLogger('scheduler');

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
    const { cronTime, onTick, timeZone, providerOptions } = jobParams;
    const jobId = uuid();
    this._jobs[jobId] = CronJob.from({
      start: schedulerConfig.AUTO_START_JOB,
      waitForCompletion: true,
      errorHandler: (e) => {
        logger.error({ err: e, jobId }, 'Job handler error');
      },
      ...providerOptions,
      cronTime,
      onTick: async () => {
        const start = performance.now();
        logger.debug({ jobId }, 'Job run started');
        await onTick();
        logger.debug(
          { jobId, durationMs: Math.round(performance.now() - start) },
          'Job run finished'
        );
      },
      timeZone
    });
    logger.debug(
      {
        jobId,
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
