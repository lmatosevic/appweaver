import { Job, JobProgress, Queue, Worker, WorkerListener } from 'bullmq';
import { EventEmitter } from 'node:events';
import { Redis as RedisClient, RedisOptions } from 'ioredis';
import { JobsOptions } from 'bullmq/dist/esm/types';
import {
  ErrorCode,
  HealthCheckResult,
  logger,
  Queue as CommonQueue,
  QueueHandlerResponse,
  QueueListener,
  QueueJobOptions,
  QueueProcessor,
  QueueWorkerOptions,
  Memory,
  uuid,
  QueueError,
  ConfigurationError
} from '@appweaver/common';
import { queueConfig } from './queue-config';
import { inject } from '../context';

type EventName = keyof WorkerListener;

type IoRedis = Memory<RedisOptions, RedisClient>;

export class BullQueue extends CommonQueue {
  /** @internal */
  private readonly _queues: Map<string, BullQueueProcessor> = new Map();
  /** @internal */
  private _healthCheckQueue?: BullQueueProcessor;

  public async onDestroy(): Promise<void> {
    await this.closeAll();
    await this._healthCheckQueue?.close();
  }

  public get<Data = any, Response = any>(
    name: string
  ): BullQueueProcessor<Data, Response> {
    let processor = this._queues.get(name);
    if (!processor) {
      processor = new BullQueueProcessor(name);
      this._queues.set(name, processor);
    }
    return processor;
  }

  public async close(name: string): Promise<boolean> {
    const processor = this._queues.get(name);
    if (!processor) {
      return false;
    }
    await processor.close();
    this._queues.delete(name);
    return true;
  }

  public async closeAll(): Promise<void> {
    for (const queueName of this._queues.keys()) {
      await this.close(queueName);
    }
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    // Reused, so an outage is logged once and not on every check
    this._healthCheckQueue ??= new BullQueueProcessor('health-check');
    try {
      await this._healthCheckQueue.ensureConnected();
      return { success: true };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }
}

class BullQueueProcessor<Data = any, Response = any> extends QueueProcessor<
  Data,
  Response,
  Job<Data, Response>,
  Worker<Data, Response>
> {
  /** @internal */
  private readonly _connection: RedisClient;
  /** @internal */
  private readonly _queue: Queue;
  /** @internal */
  private readonly _workers: Worker[] = [];
  /** @internal */
  private readonly _listeners: Record<
    string,
    { event: EventName; listener: QueueListener }
  > = {};

  constructor(public readonly name: string) {
    super();
    const connection = inject<IoRedis>(Memory).createClient({
      connectionName: `queue:${name}`,
      maxRetriesPerRequest: null
    });
    if (!connection) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        'The bullmq queue needs the redis memory provider'
      );
    }
    this._connection = connection;
    this._queue = new Queue(name, {
      connection: this._connection as any, // Needed because of different ioredis types
      skipVersionCheck: true,
      defaultJobOptions: {
        removeOnComplete: {
          count: queueConfig.KEEP_COMPLETED_COUNT,
          age: queueConfig.KEEP_COMPLETED_SECONDS
        },
        removeOnFail: {
          count: queueConfig.KEEP_FAILED_COUNT,
          age: queueConfig.KEEP_FAILED_SECONDS
        },
        attempts: queueConfig.RETRY_ATTEMPTS,
        backoff: {
          delay: queueConfig.RETRY_BACKOFF,
          type: queueConfig.RETRY_BACKOFF_TYPE
        }
      }
    });

    // Without a listener BullMQ prints every reconnection error, the outage
    // itself is logged once by the Redis connection monitor
    this._queue.on('error', (error) => {
      logger.debug(error, `Queue '${name}' error`);
    });
  }

  public async sendJob(
    data: Data,
    name?: string,
    options: QueueJobOptions = {}
  ): Promise<Job<Data, Response>> {
    await this.ensureConnected();
    return await this._queue.add(
      name ?? 'defaultJob',
      data,
      toJobsOptions(options)
    );
  }

  public async sendBulkJobs(
    jobs: Array<{
      data: Data;
      name?: string;
      options?: QueueJobOptions;
    }>
  ): Promise<Array<Job<Data, Response>>> {
    await this.ensureConnected();
    return await this._queue.addBulk(
      jobs.map(({ data, name, options }) => ({
        data,
        name: name ?? 'defaultJob',
        opts: toJobsOptions(options ?? {})
      }))
    );
  }

  public addWorker(
    processor: (job: Job<Data, Response>) => Promise<Response>,
    options: QueueWorkerOptions = {}
  ): Worker<Data, Response> {
    const worker = new Worker<Data, Response>(this.name, processor, {
      ...options.providerOptions,
      ...(options.concurrency ? { concurrency: options.concurrency } : {}),
      connection: this._connection as any, // Needed because of different ioredis types
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
        } catch (error) {
          logger.error(
            error,
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
    } catch (error) {
      logger.error(
        error,
        `Error occurred while removing worker with ID '${id}' from queue '${this.name}'`
      );
      return false;
    }
  }

  public onCompleted(
    handler: (
      job: Job<Data, Response>,
      result: Response,
      prev: string
    ) => QueueHandlerResponse
  ): string {
    return this.addListener('completed', handler);
  }

  public onFailed(
    handler: (
      job: Job<Data, Response> | undefined,
      error: Error,
      prev: string
    ) => QueueHandlerResponse
  ): string {
    return this.addListener('failed', handler);
  }

  public onError(handler: (error: Error) => QueueHandlerResponse): string {
    return this.addListener('error', handler);
  }

  public onProgress(
    handler: (
      job: Job<Data, Response>,
      progress: JobProgress
    ) => QueueHandlerResponse
  ): string {
    return this.addListener('progress', handler);
  }

  public onActive(
    handler: (job: Job<Data, Response>, prev: string) => QueueHandlerResponse
  ): string {
    return this.addListener('active', handler);
  }

  public onStalled(
    handler: (jobId: string, prev: string) => QueueHandlerResponse
  ): string {
    return this.addListener('stalled', handler);
  }

  public onDrained(handler: () => QueueHandlerResponse): string {
    return this.addListener('drained', handler);
  }

  public onReady(handler: () => QueueHandlerResponse): string {
    return this.addListener('ready', handler);
  }

  public onPaused(handler: () => QueueHandlerResponse): string {
    return this.addListener('paused', handler);
  }

  public onResumed(handler: () => QueueHandlerResponse): string {
    return this.addListener('resumed', handler);
  }

  public onClosing(handler: (msg: string) => QueueHandlerResponse): string {
    return this.addListener('closing', handler);
  }

  public onClosed(handler: () => QueueHandlerResponse): string {
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
    const connected = this._connection.status === 'ready';

    await this._queue.close();
    this.ignoreLateErrors(this._queue);

    for (const worker of this._workers) {
      // Running jobs cannot finish while Redis is down
      await worker.close(!connected);
      this.ignoreLateErrors(worker);
    }

    // BullMQ does not close a connection it was given
    if (connected) {
      await this._connection.quit();
    } else {
      this._connection.disconnect();
    }
  }

  /**
   * Fails fast while Redis is down, the queue would otherwise wait for the
   * reconnection. Waits only for a connection that is still being established.
   *
   * @internal
   */
  public async ensureConnected(): Promise<void> {
    const connection = this._connection;

    if (['wait', 'connecting', 'connect'].includes(connection.status)) {
      await new Promise<void>((resolve) => {
        const done = () => {
          connection.off('ready', done);
          connection.off('error', done);
          resolve();
        };
        connection.once('ready', done);
        connection.once('error', done);
      });
    }

    if (connection.status !== 'ready') {
      throw new QueueError(
        ErrorCode.QueueUnavailable,
        `Queue '${this.name}' is unavailable, Redis connection is not ready`,
        { queue: this.name }
      );
    }
  }

  /** @internal */
  private addListener(event: EventName, listener: QueueListener): string {
    const listenerId = uuid();
    this._listeners[listenerId] = { event, listener };
    return listenerId;
  }

  /** @internal */
  private async handleEvent(event: EventName, ...args: any[]): Promise<void> {
    const handlerActions: Promise<void>[] = [];

    for (const value of Object.values(this._listeners)) {
      if (value.event !== event) {
        continue;
      }
      handlerActions.push(value.listener(...args) as Promise<void>);
    }

    await Promise.allSettled(handlerActions);
  }

  /**
   * BullMQ removes the listeners of its connections on close, but one still
   * connecting fails afterward and emits an unhandled error that crashes the
   * process.
   *
   * @internal
   */
  private ignoreLateErrors(target: Queue | Worker): void {
    const internal = target as unknown as Record<
      string,
      EventEmitter | undefined
    >;
    for (const key of ['connection', 'blockingConnection']) {
      internal[key]?.on('error', () => undefined);
    }
  }
}

/** Converts the job options of the contract into the ones of BullMQ, leaving the defaults of the queue as they are. */
function toJobsOptions(options: QueueJobOptions): JobsOptions {
  const { providerOptions, ...jobOptions } = options;
  return Object.fromEntries(
    Object.entries({ ...providerOptions, ...jobOptions }).filter(
      ([, value]) => value !== undefined
    )
  );
}
