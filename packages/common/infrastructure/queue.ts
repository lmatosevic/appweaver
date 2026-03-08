import {
  HealthCheckConfig,
  HealthCheckResult,
  IHealthCheck,
  OnDestroy,
  OnInit
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
  static [LIFECYCLE]: true;
  static [HEALTH_CHECK] = true;

  abstract onDestroy(): Promise<void>;

  abstract get<Data = any, Response = any>(
    name: string
  ): QueueProcessor<Data, Response>;

  abstract close(name: string): Promise<boolean>;

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
  abstract sendJob(
    data: Data,
    name?: string,
    options?: JobOptions
  ): Promise<Job>;

  abstract sendBulkJobs(
    jobs: {
      data: Data;
      name?: string;
      options?: JobOptions;
    }[]
  ): Promise<Job[]>;

  abstract addWorker(
    processor: (job: Job) => Promise<Response>,
    options?: WorkerOptions
  ): Worker;

  abstract removeWorker(id: string): Promise<boolean>;

  abstract onCompleted(
    handler: (job: Job, result: Response, prev: string) => QueueHandlerResponse
  ): string;

  abstract onFailed(
    handler: (
      job: Job | undefined,
      error: Error,
      prev: string
    ) => QueueHandlerResponse
  ): string;

  abstract onError(handler: (error: Error) => QueueHandlerResponse): string;

  abstract onProgress(
    handler: (
      job: Job,
      progress: string | boolean | number | object
    ) => QueueHandlerResponse
  ): string;

  abstract onActive(
    handler: (job: Job, prev: string) => QueueHandlerResponse
  ): string;

  abstract onStalled(
    handler: (jobId: string, prev: string) => QueueHandlerResponse
  ): string;

  abstract onDrained(handler: () => QueueHandlerResponse): string;

  abstract onReady(handler: () => QueueHandlerResponse): string;

  abstract onPaused(handler: () => QueueHandlerResponse): string;

  abstract onResumed(handler: () => QueueHandlerResponse): string;

  abstract onClosing(handler: (msg: string) => QueueHandlerResponse): string;

  abstract onClosed(handler: () => QueueHandlerResponse): string;

  abstract removeListener(id: string): boolean;

  abstract close(): Promise<void>;
}
