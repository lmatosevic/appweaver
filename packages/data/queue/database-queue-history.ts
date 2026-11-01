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

/** A worker of a driver without history ids recording the first attempt of a sent job before it, within this time of
 * the sending, completes it. */
const SENT_MERGE_WINDOW_MS = 5000;

/**
 * Stores the queue history in the `_queue_jobs` table, one record per send: the retries of a job and a retry by hand
 * update its record, and a send of its id the queue ignores is recorded `ignored`, linked to the record of the job.
 */
export class DatabaseQueueHistory extends QueueHistory {
  /** @internal */
  private readonly _db = inject<PrismaDatabase>(Database as any);

  public async recordSent(
    jobs: QueueJobSent[],
    options: { sent?: boolean } = {}
  ): Promise<void> {
    if (!options.sent) {
      await this.records().createMany({
        data: jobs.map((job) => ({ ...sentFields(job), state: sentState(job) }))
      });
      return;
    }

    for (const job of jobs) {
      const fields = sentFields(job);
      // The record of a worker that started the job first: by its history id, or without one by its job id
      const started =
        (await this.records().findUnique({
          where: { id: job.id },
          select: { id: true }
        })) ??
        (await this.records().findFirst({
          where: {
            queue: job.queue,
            jobId: job.jobId,
            enqueuedAt: null,
            createdAt: {
              gte: new Date(job.sentAt.getTime() - SENT_MERGE_WINDOW_MS)
            }
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true }
        }));
      const { id: _id, ...update } = fields;
      if (started) {
        await this.records().update({
          where: { id: started.id },
          data: update
        });
      } else {
        // A worker of another process may still create it
        await this.records().upsert({
          where: { id: job.id },
          create: { ...fields, state: sentState(job) },
          update
        });
      }
    }
  }

  public async recordIgnored(
    id: string,
    job: { historyId?: string; createdAt?: Date }
  ): Promise<void> {
    let duplicateOfId = job.historyId ?? null;
    if (!duplicateOfId && job.createdAt) {
      const sent = await this.records().findUnique({
        where: { id },
        select: { queue: true, jobId: true }
      });
      const record = sent
        ? await this.records().findFirst({
            where: {
              queue: sent.queue,
              jobId: sent.jobId,
              id: { not: id },
              ...jobRecordOf(job.createdAt)
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true }
          })
        : null;
      duplicateOfId = record?.id ?? null;
    }
    await this.records().update({
      where: { id },
      data: { state: 'ignored', finishedAt: new Date(), duplicateOfId }
    });
  }

  public async recordStarted(job: QueueJobStarted): Promise<string> {
    const attempt = {
      state: 'running',
      attempt: job.attempt,
      startedAt: job.startedAt,
      finishedAt: null,
      attemptedBy: job.instance,
      ...(job.createdAt ? { jobCreatedAt: job.createdAt } : {}),
      ...(job.maxAttempts === undefined ? {} : { maxAttempts: job.maxAttempts })
    };

    const created = {
      queue: job.queue,
      jobId: job.jobId,
      name: job.name,
      driver: job.driver,
      data: job.data as any,
      ...attempt
    };
    if (job.id) {
      // The sender may still create it, i.e. once its transaction commits
      await this.records().upsert({
        where: { id: job.id },
        create: { id: job.id, ...created },
        update: attempt
      });
      return job.id;
    }

    const record = await this.records().findFirst({
      where: {
        queue: job.queue,
        jobId: job.jobId,
        ...(job.createdAt
          ? jobRecordOf(job.createdAt)
          : { state: { in: unfinishedStates } })
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    });
    if (record) {
      await this.records().update({ where: { id: record.id }, data: attempt });
      return record.id;
    }

    const id = uuid7();
    await this.records().create({ data: { id, ...created } });
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
        OR: [
          {
            state: { in: ['completed', 'failed', 'ignored'] },
            finishedAt: { lt: before }
          },
          // A job the queue lost, i.e. with the memory queue on a restart, unless it is due later
          {
            state: { in: unfinishedStates },
            updatedAt: { lt: before },
            OR: [{ scheduledAt: null }, { scheduledAt: { lt: before } }]
          }
        ]
      }
    });
    return count;
  }

  /** @internal */
  private records(): any {
    return this._db.client<any>().queueJobRecord;
  }
}

/**
 * The records a job created at a time may have: the one it started before, a retry by hand reopening it, or an
 * unfinished one of its id sent before it, so neither a later send of its id nor an earlier job of the same id is
 * taken for it.
 */
function jobRecordOf(createdAt: Date) {
  return {
    OR: [
      { jobCreatedAt: createdAt },
      {
        jobCreatedAt: null,
        state: { in: unfinishedStates },
        OR: [{ enqueuedAt: null }, { enqueuedAt: { lte: createdAt } }]
      }
    ]
  };
}

/** The state of a sent job, before a worker starts it. */
function sentState(job: QueueJobSent): QueueJobState {
  return job.scheduledAt ? 'scheduled' : 'pending';
}

/** The fields of a sent job, without its state. */
function sentFields(job: QueueJobSent) {
  const { caller } = job;
  return {
    id: job.id,
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
