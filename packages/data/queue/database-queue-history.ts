import {
  Database,
  QueueHistory,
  QueueJobError,
  QueueJobFinished,
  QueueJobSent,
  QueueJobStarted,
  QueueJobState,
  uuid7
} from '@appweaver/common';
import { inject } from '@appweaver/core';
import { PrismaDatabase } from '../database';

/** The states of a job a worker may still pick up. */
const unfinishedStates: QueueJobState[] = [
  'pending',
  'scheduled',
  'running',
  'retrying',
  'stalled'
];

/** A worker recording the first attempt of a sent job before it, within this time of the sending, completes it. */
const SENT_MERGE_WINDOW_MS = 5000;

/** Stores the queue history in the `_queue_jobs` table, one record per sent job. */
export class DatabaseQueueHistory extends QueueHistory {
  /** @internal */
  private readonly _db = inject<PrismaDatabase>(Database as any);

  public async recordSent(
    jobs: QueueJobSent[],
    options: { sent?: boolean } = {}
  ): Promise<string[]> {
    const records = jobs.map((job) => ({ id: uuid7(), ...sentFields(job) }));

    if (!options.sent) {
      await this.records().createMany({
        data: records.map((record, i) => ({
          ...record,
          state: jobs[i].scheduledAt ? 'scheduled' : 'pending'
        }))
      });
      return records.map((record) => record.id);
    }

    const ids: string[] = [];
    for (const [i, record] of records.entries()) {
      const { id, ...fields } = record;
      const started = await this.records().findFirst({
        where: {
          queue: record.queue,
          jobId: record.jobId,
          enqueuedAt: null,
          createdAt: {
            gte: new Date(jobs[i].sentAt.getTime() - SENT_MERGE_WINDOW_MS)
          }
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });
      if (started) {
        await this.records().update({
          where: { id: started.id },
          data: fields
        });
        ids.push(started.id);
      } else {
        await this.records().create({
          data: {
            ...record,
            state: jobs[i].scheduledAt ? 'scheduled' : 'pending'
          }
        });
        ids.push(id);
      }
    }
    return ids;
  }

  public async recordStarted(job: QueueJobStarted): Promise<string> {
    const attempt = {
      state: 'running',
      attempt: job.attempt,
      startedAt: job.startedAt,
      attemptedBy: job.instance,
      ...(job.maxAttempts === undefined ? {} : { maxAttempts: job.maxAttempts })
    };

    const record = await this.records().findFirst({
      where: {
        queue: job.queue,
        jobId: job.jobId,
        state: { in: unfinishedStates }
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    });
    if (record) {
      await this.records().update({ where: { id: record.id }, data: attempt });
      return record.id;
    }

    const id = uuid7();
    await this.records().create({
      data: {
        id,
        queue: job.queue,
        jobId: job.jobId,
        name: job.name,
        driver: job.driver,
        data: job.data as any,
        ...attempt
      }
    });
    return id;
  }

  public async recordFinished(
    id: string,
    outcome: QueueJobFinished
  ): Promise<void> {
    const data: Record<string, unknown> = {
      state: outcome.state,
      attempt: outcome.attempt,
      durationMs: outcome.durationMs
    };
    if (outcome.state !== 'retrying') {
      data.finishedAt = outcome.finishedAt;
    }
    if (outcome.result !== undefined) {
      data.result = outcome.result;
    }
    if (outcome.error) {
      const record = await this.records().findUnique({
        where: { id },
        select: { errors: true }
      });
      const errors = Array.isArray(record?.errors)
        ? (record.errors as QueueJobError[])
        : [];
      data.errors = [...errors, outcome.error];
      data.lastError = outcome.error.message;
    }
    await this.records().update({ where: { id }, data });
  }

  public async recordStalled(queue: string, jobId: string): Promise<void> {
    const record = await this.records().findFirst({
      where: { queue, jobId, state: 'running' },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    });
    if (record) {
      await this.records().update({
        where: { id: record.id },
        data: { state: 'stalled' }
      });
    }
  }

  public async prune(before: Date): Promise<number> {
    const { count } = await this.records().deleteMany({
      where: {
        state: { in: ['completed', 'failed'] },
        finishedAt: { lt: before }
      }
    });
    return count;
  }

  /** @internal */
  private records(): any {
    return this._db.client<any>().queueJobRecord;
  }
}

/** The fields of a sent job, without its state. */
function sentFields(job: QueueJobSent) {
  const { caller } = job;
  return {
    queue: job.queue,
    jobId: job.jobId,
    name: job.name,
    driver: job.driver,
    data: job.data as any,
    metadata: job.metadata as any,
    options: job.options as any,
    priority: job.priority,
    maxAttempts: job.maxAttempts,
    enqueuedAt: job.sentAt,
    scheduledAt: job.scheduledAt,
    enqueuedBy: caller.instance,
    userId: caller.userId,
    authType: caller.authType,
    authSource: caller.authSource,
    apiKeyId: caller.apiKeyId,
    parentId: caller.parentId,
    callerSite: caller.site
  };
}
