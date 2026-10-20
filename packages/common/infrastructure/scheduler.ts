import { OnDestroy } from '../interfaces';
import { LIFECYCLE } from '../constants';

/** A scheduled job, the same for every scheduler. */
export type JobParams = {
  /** A cron expression, i.e. `0 9 * * 1-5`, with an optional leading seconds field, or the date of a single run. */
  cronTime: string | Date;
  /** Runs on every tick of the job. */
  onTick: () => unknown;
  /** The IANA time zone of the cron expression, i.e. `Europe/Zagreb`. Default: the time zone of the process. */
  timeZone?: string;
  /** Options of the scheduler driver. */
  providerOptions?: Record<string, unknown>;
};

export abstract class Scheduler<Job = unknown> implements OnDestroy {
  static [LIFECYCLE] = true;

  abstract onDestroy(): Promise<void>;

  /** Starts all registered jobs. */
  abstract startAll(): void;

  /** Stops all running jobs.
   *
   * @return A promise that resolves when all jobs are stopped.
   */
  abstract stopAll(): Promise<void>;

  /**
   * Registers a new scheduled job.
   *
   * @param {Object} jobParams - The job configuration.
   * @return {string} The ID of the created job.
   */
  abstract addJob(jobParams: JobParams): string;

  /**
   * Retrieves a job by its ID.
   *
   * @param {string} jobId - The job ID to look up.
   * @return {Object | undefined} The job object, or `undefined` if not found.
   */
  abstract getJob(jobId: string): Job | undefined;

  /**
   * Starts a specific job by ID.
   * @param {string} jobId - The job ID to start.
   * @return `true` if started successfully, `false` otherwise.
   */
  abstract startJob(jobId: string): boolean;

  /**
   * Stops a specific job by ID.
   *
   * @param {string} jobId - The job ID to stop.
   * @return {Promise<boolean>} A promise that resolves to `true` if stopped successfully, `false` otherwise.
   */
  abstract stopJob(jobId: string): Promise<boolean>;

  /**
   * Removes a job by ID.
   *
   * @param {string} jobId - The job ID to remove.
   * @return {Promise<boolean>} A promise that resolves to `true` if removed successfully, `false` otherwise.
   */
  abstract removeJob(jobId: string): Promise<boolean>;
}
