import {
  HealthCheckConfig,
  HealthCheckResult,
  IHealthCheck,
  OnDestroy
} from '../interfaces';
import { HEALTH_CHECK, LIFECYCLE } from '../constants';

export type QueueHandlerResponse<T = void> = Promise<T> | T;

export type QueueListener<T = void> = (
  ...args: any[]
) => QueueHandlerResponse<T>;

export type QueueJob<T = any, R = any> = {
  id?: string;
  name: string;
  data: T;
  returnvalue: R;
};

export abstract class Queue implements IHealthCheck, OnDestroy {
  static [LIFECYCLE] = true;
  static [HEALTH_CHECK] = true;

  abstract onDestroy(): Promise<void>;

  /**
   * Returns the processor for the named queue.
   *
   * @param {string} name - The queue name.
   */
  abstract get<Data = any, Response = any>(
    name: string
  ): QueueProcessor<Data, Response>;

  /**
   * Closes a specific queue by name.
   *
   * @param {string} name - The queue name to close.
   * @returns `true` if closed successfully, `false` otherwise.
   */
  abstract close(name: string): Promise<boolean>;

  /** Closes all open queues.
   *
   * @return A promise that resolves when all queue connections are closed.
   */
  abstract closeAll(): Promise<void>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'queue' };
  }
}

export abstract class QueueProcessor<
  Data = any,
  Response = any,
  Job extends QueueJob = QueueJob<Data, Response>,
  JobOptions = any,
  Worker = any,
  WorkerOptions = any
> {
  /**
   * Sends a single job to the queue.
   *
   * @param {Object} data - The job payload.
   * @param {name} name - Optional job name.
   * @param {Object} options - Optional job options.
   */
  abstract sendJob(
    data: Data,
    name?: string,
    options?: JobOptions
  ): Promise<Job>;

  /**
   * Sends multiple jobs for processing in bulk.
   *
   * @param {Object[]} jobs - An array of job objects to be processed.
   * @param {Object} [jobs[].data] - The data associated with the job.
   * @param {string} [jobs[].name] - An optional name for the job.
   * @param {Object} [jobs[].options] - Optional configuration settings for the job.
   * @return A promise that resolves with an array of processed jobs.
   */
  abstract sendBulkJobs(
    jobs: {
      data: Data;
      name?: string;
      options?: JobOptions;
    }[]
  ): Promise<Job[]>;

  /**
   * Registers a worker to process jobs.
   *
   * @param {(job: Object) => Promise<Response>} processor - The job processing function.
   * @param {WorkerOptions} [options] - Optional worker options.
   * @returns {Worker} The created worker instance.
   */
  abstract addWorker(
    processor: (job: Job) => Promise<Response>,
    options?: WorkerOptions
  ): Worker;

  /**
   * Removes a registered worker by ID.
   *
   * @param {string} id - The worker ID to remove.
   * @returns {Promise<boolean>}
   */
  abstract removeWorker(id: string): Promise<boolean>;

  /**
   * Registers a handler for job completion events.
   *
   * @param {(job: Object, result: Response, prev: string) => QueueHandlerResponse} handler - Called with the completed
   * job, result, and previous state.
   * @returns {string} A listener ID for later removal.
   */
  abstract onCompleted(
    handler: (job: Job, result: Response, prev: string) => QueueHandlerResponse
  ): string;

  /**
   * Registers a handler for job failure events.
   *
   * @param {(job: Object | undefined, error: Error, prev: string) => QueueHandlerResponse} handler - Called with the
   * failed job (if any), error, and previous state.
   * @returns {string} A listener ID for later removal.
   */
  abstract onFailed(
    handler: (
      job: Job | undefined,
      error: Error,
      prev: string
    ) => QueueHandlerResponse
  ): string;

  /**
   * Registers a handler for queue-level errors.
   *
   * @param {(error: Error) => QueueHandlerResponse} handler - Called with the error.
   * @returns {string} A listener ID for later removal.
   */
  abstract onError(handler: (error: Error) => QueueHandlerResponse): string;

  /**
   * Registers a handler for job progress updates.
   *
   * @param {(job: Object, progress: string | boolean | number | object) => QueueHandlerResponse} handler - Called with
   * the job and its current progress value.
   * @returns {string} A listener ID for later removal.
   */
  abstract onProgress(
    handler: (
      job: Job,
      progress: string | boolean | number | object
    ) => QueueHandlerResponse
  ): string;

  /**
   * Registers a handler for when a job becomes active.
   *
   * @param {(job: Object, prev: string) => QueueHandlerResponse} handler - Called with the job and previous state.
   * @returns {string} A listener ID for later removal.
   */
  abstract onActive(
    handler: (job: Job, prev: string) => QueueHandlerResponse
  ): string;

  /**
   * Registers a handler for stalled job events.
   * @param {(jobId: string, prev: string) => QueueHandlerResponse} handler - Called with the stalled job ID and
   * previous state.
   * @returns {string} A listener ID for later removal.
   */
  abstract onStalled(
    handler: (jobId: string, prev: string) => QueueHandlerResponse
  ): string;

  /**
   * Registers a handler for when the queue is drained (no more jobs).
   * @param {() => QueueHandlerResponse} handler
   * @returns {string} A listener ID for later removal.
   */
  abstract onDrained(handler: () => QueueHandlerResponse): string;

  /**
   * Registers a handler for when the queue is ready.
   * @param {() => QueueHandlerResponse} handler
   * @returns {string} A listener ID for later removal.
   */
  abstract onReady(handler: () => QueueHandlerResponse): string;

  /**
   * Registers a handler for when the queue is paused.
   * @param {() => QueueHandlerResponse} handler
   * @returns {string} A listener ID for later removal.
   */
  abstract onPaused(handler: () => QueueHandlerResponse): string;

  /**
   * Registers a handler for when the queue is resumed.
   * @param {() => QueueHandlerResponse} handler
   * @returns {string} A listener ID for later removal.
   */
  abstract onResumed(handler: () => QueueHandlerResponse): string;

  /**
   * Registers a handler for when the queue begins closing.
   * @param {(msg: string) => QueueHandlerResponse} handler - Called with a closing message.
   * @returns {string} A listener ID for later removal.
   */
  abstract onClosing(handler: (msg: string) => QueueHandlerResponse): string;

  /**
   * Registers a handler for when the queue is fully closed.
   * @param {() => QueueHandlerResponse} handler
   * @returns {string} A listener ID for later removal.
   */
  abstract onClosed(handler: () => QueueHandlerResponse): string;

  /**
   * Removes a previously registered event listener.
   * @param {string} id - The listener ID to remove.
   * @returns {boolean} `true` if the listener was found and removed.
   */
  abstract removeListener(id: string): boolean;

  /** Closes this queue processor.
   *
   * @return {Promise<void>} A promise that resolves when queue is closed.
   */
  abstract close(): Promise<void>;
}
