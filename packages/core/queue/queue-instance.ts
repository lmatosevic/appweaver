import {
  Job,
  JobProgress,
  Queue,
  Worker,
  WorkerListener,
  WorkerOptions
} from 'bullmq';
import { JobsOptions } from 'bullmq/dist/esm/types';
import { config, logger, uuid } from '@appweaver/common';
import { redis } from '../redis';

type EventName = keyof WorkerListener;

type OptionalPromise<T = void> = Promise<T> | T;

type ListenerFn = (...args: any[]) => OptionalPromise;

export class QueueInstance<T = any, R = any> {
  private readonly connection = redis.createClient({
    maxRetriesPerRequest: null
  });
  private readonly _queue: Queue;
  private readonly _workers: Worker[] = [];
  private readonly _listeners: Record<
    string,
    { event: EventName; listener: ListenerFn }
  > = {};

  constructor(public readonly name: string) {
    this._queue = new Queue(name, {
      connection: this.connection,
      skipVersionCheck: true,
      defaultJobOptions: {
        removeOnComplete: {
          count: config.QUEUE_KEEP_COMPLETED_COUNT,
          age: config.QUEUE_KEEP_COMPLETED_SECONDS
        },
        removeOnFail: {
          count: config.QUEUE_KEEP_FAILED_COUNT,
          age: config.QUEUE_KEEP_FAILED_SECONDS
        },
        attempts: config.QUEUE_RETRY_ATTEMPTS,
        backoff: {
          delay: config.QUEUE_RETRY_BACKOFF,
          type: config.QUEUE_RETRY_BACKOFF_TYPE
        }
      }
    });
  }

  public async sendJob(
    data: T,
    name?: string,
    options: JobsOptions = {}
  ): Promise<Job<T, R>> {
    return await this._queue.add(name ?? 'defaultJob', data, options);
  }

  public async sendBulkJobs(
    jobs: Array<{
      data: T;
      name?: string;
      options?: Omit<JobsOptions, 'repeat'>;
    }>
  ): Promise<Array<Job<T, R>>> {
    return await this._queue.addBulk(
      jobs.map(({ data, name, options }) => ({
        data,
        name: name ?? 'defaultJob',
        ...(options ?? {})
      }))
    );
  }

  public addWorker(
    processor: (job: Job<T, R>) => Promise<R>,
    options: Omit<WorkerOptions, 'connection'> = {}
  ): Worker<T, R> {
    const worker = new Worker<T, R>(this.name, processor, {
      ...options,
      connection: this.connection,
      skipVersionCheck: true,
      name: `${this.name}_${uuid()}`
    });

    for (const event of [
      'completed',
      'failed',
      'error',
      'progress',
      'active',
      'stalled',
      'drained',
      'ready',
      'paused',
      'resumed',
      'closing',
      'closed'
    ] as EventName[]) {
      worker.on(event, async (...args: any[]) => {
        try {
          await this.handleEvent(event, ...args);
        } catch (e) {
          logger.error(
            e,
            `Error occurred while handling event '${event}' for queue '${this.name}'`
          );
        }
      });
    }

    this._workers.push(worker);

    return worker;
  }

  public async removeWorker(id: string): Promise<boolean> {
    const index = this._workers.findIndex((w) => w.id === id);
    if (index === -1) {
      return false;
    }

    try {
      await this._workers[index].close();
      this._workers.splice(index, 1);
      return true;
    } catch (e) {
      logger.error(
        e,
        `Error occurred while removing worker with ID '${id}' from queue '${this.name}'`
      );
      return false;
    }
  }

  public onCompleted(
    handler: (job: Job<T, R>, result: R, prev: string) => OptionalPromise
  ): string {
    return this.addListener('completed', handler);
  }

  public onFailed(
    handler: (
      job: Job<T, R> | undefined,
      error: Error,
      prev: string
    ) => OptionalPromise
  ): string {
    return this.addListener('failed', handler);
  }

  public onError(handler: (error: Error) => OptionalPromise): string {
    return this.addListener('error', handler);
  }

  public onProgress(
    handler: (job: Job<T, R>, progress: JobProgress) => OptionalPromise
  ): string {
    return this.addListener('progress', handler);
  }

  public onActive(
    handler: (job: Job<T, R>, prev: string) => OptionalPromise
  ): string {
    return this.addListener('active', handler);
  }

  public onStalled(
    handler: (jobId: string, prev: string) => OptionalPromise
  ): string {
    return this.addListener('stalled', handler);
  }

  public onDrained(handler: () => OptionalPromise): string {
    return this.addListener('drained', handler);
  }

  public onReady(handler: () => OptionalPromise): string {
    return this.addListener('ready', handler);
  }

  public onPaused(handler: () => OptionalPromise): string {
    return this.addListener('paused', handler);
  }

  public onResumed(handler: () => OptionalPromise): string {
    return this.addListener('resumed', handler);
  }

  public onClosing(handler: (msg: string) => OptionalPromise): string {
    return this.addListener('closing', handler);
  }

  public onClosed(handler: () => OptionalPromise): string {
    return this.addListener('closed', handler);
  }

  public removeListener(id: string): boolean {
    const listener = this._listeners[id];
    if (!listener) {
      return false;
    }

    delete this._listeners[id];
    return true;
  }

  public async close(): Promise<void> {
    await this._queue.close();
    for (const worker of this._workers) {
      await worker.close();
    }
  }

  get queue() {
    return this._queue;
  }

  get workers() {
    return this._workers;
  }

  private addListener(event: EventName, listener: ListenerFn): string {
    const listenerId = uuid();
    this._listeners[listenerId] = { event, listener };
    return listenerId;
  }

  private async handleEvent(event: EventName, ...args: any[]): Promise<void> {
    const handlerActions: Array<Promise<void>> = [];

    for (const value of Object.values(this._listeners)) {
      if (value.event !== event) {
        continue;
      }
      handlerActions.push(value.listener(...args) as Promise<void>);
    }

    await Promise.allSettled(handlerActions);
  }
}
