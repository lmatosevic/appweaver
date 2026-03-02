export abstract class Scheduler<Job = any, JobParams = any> {
  abstract startAll(): void;

  abstract stopAll(): Promise<void>;

  abstract addJob(jobParams: JobParams): string;

  abstract getJob(jobId: string): Job | undefined;

  abstract startJob(jobId: string): boolean;

  abstract stopJob(jobId: string): Promise<boolean>;

  abstract removeJob(jobId: string): Promise<boolean>;
}
