import {
  createLogger,
  isAppweaverError,
  PubSub,
  QueueJob,
  QueueProcessor,
  uuidv4
} from '@appweaver/common';
import { inject } from '../context';

const logger = createLogger('queue');

/** The prefix of the IDs of the jobs a caller waits for, whose results are published. */
const WAITED_PREFIX = 'waited-';

/** An error of a job as a JSON value, published to the instance waiting for the job. */
export type JobErrorData = {
  message: string;
  name?: string;
  code?: string;
  details?: Record<string, unknown>;
};

/** The result of a job published to the instance waiting for it. */
type JobResultMessage<R> = {
  jobId: string;
  result?: R;
  error?: JobErrorData;
};

/** The options of {@link JobResults}. */
export type JobResultsOptions = {
  /** Creates the error a waiting caller rejects with from the error of the job, i.e. a `SmsError` of its code */
  toError?: (error: JobErrorData) => Error;
};

/**
 * Delivers the results of the jobs of a queue to the callers waiting for them, on whichever instance the worker of a
 * job runs. A waited job is sent with an ID of its own, and its result goes through the `PubSub` (the channel
 * `queue:<name>:results`), or straight to the caller without one. Only the results of the waited jobs are published.
 *
 * @example
 * const results = new JobResults(queue, 'sms');
 * const sent = await results.wait((jobId) => queue.sendJob(message, undefined, { jobId }));
 */
export class JobResults<Data = any, Response = any> {
  /** @internal */
  private readonly _channel: string;
  /** @internal */
  private readonly _pubsub = inject(PubSub, false);
  /** @internal */
  private readonly _waiting = new Map<
    string,
    { resolve: (result: Response) => void; reject: (error: Error) => void }
  >();
  /** @internal */
  private _subscription?: Promise<string>;

  /**
   * Registers the completion and failure handlers of the queue, which publish the results of the waited jobs.
   *
   * @param {QueueProcessor} processor - The queue.
   * @param {string} name - The name of the queue, naming its results channel.
   * @param {JobResultsOptions} [options] - How the errors are created.
   */
  constructor(
    private readonly processor: QueueProcessor<Data, Response>,
    name: string,
    private readonly options: JobResultsOptions = {}
  ) {
    this._channel = `queue:${name}:results`;
    processor.onCompleted((job, result) => this.publish(job, { result }));
    processor.onFailed((job, error) => {
      if (!processor.willRetry(job)) {
        return this.publish(job, { error: toJobErrorData(error) });
      }
    });
  }

  /**
   * Sends a job and waits until it completes, or fails after the retries of the queue.
   *
   * @param {Function} send - Sends the job with the given job ID.
   * @return {Promise<Response>} The result of the job.
   * @throws {Error} The error of the job, created by the `toError` option.
   */
  public async wait(
    send: (jobId: string) => Promise<QueueJob<Data, Response>>
  ): Promise<Response> {
    if (this._pubsub) {
      this._subscription ??= this._pubsub.subscribe<JobResultMessage<Response>>(
        this._channel,
        (message) => this.settle(message)
      );
      await this._subscription;
    }

    const jobId = `${WAITED_PREFIX}${uuidv4()}`;
    const result = new Promise<Response>((resolve, reject) =>
      this._waiting.set(jobId, { resolve, reject })
    );
    try {
      await send(jobId);
    } catch (error) {
      this._waiting.delete(jobId);
      throw error;
    }
    return result.finally(() => this._waiting.delete(jobId));
  }

  /** Stops receiving the results, rejecting nothing: the waiting callers are left to their timeouts. */
  public async close(): Promise<void> {
    const subscription = this._subscription;
    this._subscription = undefined;
    if (subscription && this._pubsub) {
      await this._pubsub.unsubscribe(await subscription);
    }
  }

  /** @internal */
  private async publish(
    job: QueueJob<Data, Response> | undefined,
    outcome: Omit<JobResultMessage<Response>, 'jobId'>
  ): Promise<void> {
    if (!job?.id?.startsWith(WAITED_PREFIX)) {
      return;
    }
    const message = { jobId: job.id, ...outcome };
    if (!this._pubsub) {
      this.settle(message);
      return;
    }
    try {
      await this._pubsub.publish(this._channel, message);
    } catch (error) {
      logger.error(error, `Result of the job '${job.id}' not published`);
    }
  }

  /** @internal */
  private settle(message: JobResultMessage<Response>): void {
    const waiting = this._waiting.get(message.jobId);
    if (!waiting) {
      return;
    }
    if (message.error) {
      const toError = this.options.toError ?? defaultError;
      waiting.reject(toError(message.error));
    } else {
      waiting.resolve(message.result as Response);
    }
  }
}

/**
 * Converts an error into the JSON value published to the waiting caller, keeping the code and the details of an
 * Appweaver error.
 *
 * @param {unknown} error - The error of the job.
 * @return {JobErrorData} The error as a JSON value.
 */
export function toJobErrorData(error: unknown): JobErrorData {
  if (isAppweaverError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      details: error.details
    };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}

function defaultError(data: JobErrorData): Error {
  const error = new Error(data.message);
  if (data.name) {
    error.name = data.name;
  }
  return error;
}
