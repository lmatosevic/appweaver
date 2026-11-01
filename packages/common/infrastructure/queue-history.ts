/** The state of a job in the queue history. */
export type QueueJobState =
  | 'pending'
  | 'scheduled'
  | 'running'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'stalled'
  | 'ignored';

/** Who sent a job, from the context of the call sending it. */
export type QueueJobCaller = {
  /** The process sending the job, `<hostname>:<pid>`. */
  instance: string;
  /** The id of the authenticated user. */
  userId?: string;
  /** How the user authenticated, i.e. `jwt` or `apiKey`. */
  authType?: string;
  /** How the user signed in, i.e. `password` or `oauth2Google`. */
  authSource?: string;
  /** The id of the API key the user authenticated with. */
  apiKeyId?: string;
  /** The id of the history record of the job that sent this one, when a worker sends it. */
  parentId?: string;
  /** The `file:line:column` of the code calling `sendJob`, with `queue.history.recordCallerSite` only. */
  site?: string;
};

/** A job sent to a queue. */
export type QueueJobSent = {
  /** The id of its record, sent with the job as its `historyId` option. */
  id: string;
  queue: string;
  jobId: string;
  name: string;
  sentAt: Date;
  caller: QueueJobCaller;
  /** The provider of the queue, i.e. `bullmq`. */
  driver?: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
  /** The job options, without the options of the driver. */
  options?: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  /** When a delayed job is due. */
  scheduledAt?: Date;
};

/** An attempt of a job, started by a worker. */
export type QueueJobStarted = {
  queue: string;
  jobId: string;
  name: string;
  attempt: number;
  startedAt: Date;
  /** The process of the worker, `<hostname>:<pid>`. */
  instance: string;
  driver?: string;
  maxAttempts?: number;
  /** The record of the job, its `historyId`, when the driver reports it. */
  id?: string;
  /** When the queue created the job, which finds its record without a `historyId`. */
  createdAt?: Date;
  /** The payload, stored when no record of the sent job exists. */
  data?: unknown;
};

/** The error of a failed attempt. */
export type QueueJobError = {
  attempt: number;
  /** An ISO date-time. */
  at: string;
  message: string;
  name?: string;
  code?: string;
  stack?: string;
};

/** The outcome of an attempt of a job. */
export type QueueJobFinished = {
  /** `retrying` when the job has attempts left. */
  state: 'completed' | 'retrying' | 'failed';
  attempt: number;
  finishedAt: Date;
  durationMs: number;
  result?: unknown;
  error?: QueueJobError;
};

/**
 * Stores what happens to the jobs of every queue: who sent them, each attempt, its error and the result. The queue
 * stays the source of truth, the history is written beside it and never fails a job.
 */
export abstract class QueueHistory {
  /**
   * Records the jobs sent to a queue.
   *
   * @param {QueueJobSent[]} jobs - The sent jobs, each with the id of its record.
   * @param {Object} [options] - With `sent`, the jobs are already in the queue, so a worker may have recorded their
   * first attempt before, which the record of a job then completes.
   */
  abstract recordSent(
    jobs: QueueJobSent[],
    options?: { sent?: boolean }
  ): Promise<void>;

  /**
   * Records a send the queue ignored, since a job with its id was still in the queue: marks the record of the send
   * `ignored`, finished and linked by its `duplicateOfId` to the record of the job in the queue.
   *
   * @param {string} id - The record of the send.
   * @param {Object} job - The job in the queue: the `historyId` it reports, or its creation time, which finds its
   * record without one.
   */
  abstract recordIgnored(
    id: string,
    job: { historyId?: string; createdAt?: Date }
  ): Promise<void>;

  /**
   * Records the start of an attempt on the record of its job, reopened when it is finished (a job retried by hand):
   * the record of its `historyId`, created when missing, or without one the record found by the creation time of the
   * job, otherwise the latest unfinished one, or a new record when the job has none.
   *
   * @param {QueueJobStarted} job - The started attempt.
   * @return {Promise<string>} The id of the record.
   */
  abstract recordStarted(job: QueueJobStarted): Promise<string>;

  /**
   * Records the outcome of an attempt, or of a job the queue refused, with the attempt `0`.
   *
   * @param {string} id - The id of the record, of the sent job or returned by {@link recordStarted}.
   * @param {QueueJobFinished} outcome - The outcome of the attempt.
   */
  abstract recordFinished(id: string, outcome: QueueJobFinished): Promise<void>;

  /**
   * Records a stalled job, whose worker stopped responding while processing it.
   *
   * @param {string} queue - The queue name.
   * @param {string} jobId - The id of the job.
   */
  abstract recordStalled(queue: string, jobId: string): Promise<void>;

  /**
   * Deletes the records of the jobs finished before a date, and of the unfinished ones not updated since then and not
   * due after it, which the queue lost.
   *
   * @param {Date} before - The date.
   * @return {Promise<number>} The number of deleted records.
   */
  abstract prune(before: Date): Promise<number>;
}
