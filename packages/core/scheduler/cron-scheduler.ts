import { CronJob, CronJobParams } from 'cron';
import { config, logger, Scheduler, uuid } from '@appweaver/common';

export class CronScheduler extends Scheduler<CronJob, CronJobParams> {
  /** @internal */
  private readonly _jobs: Record<string, CronJob> = {};

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
        return;
      }
      const stopAction = job.stop();
      if (stopAction) {
        stopActions.push(stopAction);
      }
    }

    await Promise.allSettled(stopActions);
  }

  public addJob(jobParams: CronJobParams): string {
    const jobId = uuid();
    this._jobs[jobId] = CronJob.from({
      start: config.SCHEDULER_AUTO_START_JOB,
      waitForCompletion: true,
      errorHandler: (e) => {
        logger.error(e, `Job handler error`);
      },
      ...jobParams
    });
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
    return true;
  }

  public async stopJob(jobId: string): Promise<boolean> {
    const job = this._jobs[jobId];
    if (!job) {
      return false;
    }

    await job.stop();
    return true;
  }

  public async removeJob(jobId: string): Promise<boolean> {
    const job = this._jobs[jobId];
    if (!job) {
      return false;
    }

    await job.stop();
    delete this._jobs[jobId];
    return true;
  }
}
