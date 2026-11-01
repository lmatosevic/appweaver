/** The state of a job in the queue history. */
export type QueueJobState =
  | 'pending'
  | 'scheduled'
  | 'running'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'stalled';

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
  /** When the queue created the job, which finds its record among the ones of the same job id. */
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
   * @param {QueueJobSent[]} jobs - The sent jobs.
   * @param {Object} [options] - With `sent`, the jobs are already in the queue, so a worker may have recorded their
   * first attempt before, which the record of a job then completes.
   * @return {Promise<string[]>} The ids of the records, in the order of the jobs.
   */
  abstract recordSent(
    jobs: QueueJobSent[],
    options?: { sent?: boolean }
  ): Promise<string[]>;

  /**
   * Records a send the queue ignored, since a job with its id was still in the queue: deletes the record of the send,
   * when one was made, and counts it in the `duplicates` of the record of the job in the queue.
   *
   * @param {string} queue - The queue name.
   * @param {string} jobId - The id of the job.
   * @param {Date} createdAt - When the queue created the job in it, which finds its record.
   * @param {string} [id] - The record made for the send, returned by {@link recordSent}.
   */
  abstract recordIgnored(
    queue: string,
    jobId: string,
    createdAt: Date,
    id?: string
  ): Promise<void>;

  /**
   * Records the start of an attempt on the record of its job: with the creation time of the job, the latest record
   * sent before it, reopened when it is finished (a job retried by hand), otherwise the latest unfinished one, or a new
   * record when the job has none.
   *
   * @param {QueueJobStarted} job - The started attempt.
   * @return {Promise<string>} The id of the record.
   */
  abstract recordStarted(job: QueueJobStarted): Promise<string>;

  /**
   * Records the outcome of an attempt, or of a job the queue refused, with the attempt `0`.
   *
   * @param {string} id - The id of the record, returned by {@link recordStarted} or {@link recordSent}.
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
   * Deletes the records of the jobs finished before a date.
   *
   * @param {Date} before - The date.
   * @return {Promise<number>} The number of deleted records.
   */
  abstract prune(before: Date): Promise<number>;
}
