import { OnDestroy } from '../interfaces';
import { LIFECYCLE } from '../constants';

export abstract class Scheduler<
  Job = any,
  JobParams = any
> implements OnDestroy {
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
   * @returns {string} The ID of the created job.
   */
  abstract addJob(jobParams: JobParams): string;

  /**
   * Retrieves a job by its ID.
   *
   * @param {string} jobId - The job ID to look up.
   * @returns {Object | undefined} The job object, or `undefined` if not found.
   */
  abstract getJob(jobId: string): Job | undefined;

  /**
   * Starts a specific job by ID.
   * @param {string} jobId - The job ID to start.
   * @returns `true` if started successfully, `false` otherwise.
   */
  abstract startJob(jobId: string): boolean;

  /**
   * Stops a specific job by ID.
   *
   * @param {string} jobId - The job ID to stop.
   * @returns {Promise<boolean>} A promise that resolves to `true` if stopped successfully, `false` otherwise.
   */
  abstract stopJob(jobId: string): Promise<boolean>;

  /**
   * Removes a job by ID.
   *
   * @param {string} jobId - The job ID to remove.
   * @returns {Promise<boolean>} A promise that resolves to `true` if removed successfully, `false` otherwise.
   */
  abstract removeJob(jobId: string): Promise<boolean>;
}
