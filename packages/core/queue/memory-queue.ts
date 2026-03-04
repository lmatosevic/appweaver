import {
  HealthCheckResult,
  logger,
  Queue as CommonQueue,
  QueueHandlerResponse,
  QueueJob,
  QueueListener,
  QueueProcessor,
  uuid
} from '@appweaver/common';

type MemoryQueueJob<Data = any, Response = any> = QueueJob<Data, Response> & {
  status: 'waiting' | 'active' | 'completed' | 'failed';
  error?: Error;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  processedAt?: number;
  finishedAt?: number;
};

type MemoryJobOptions = {
  attempts?: number;
  delay?: number;
  priority?: number;
};

type MemoryWorker<Data = any, Response = any> = {
  id: string;
  processor: (job: MemoryQueueJob<Data, Response>) => Promise<Response>;
  active: boolean;
};

type EventName =
  | 'completed'
  | 'failed'
  | 'error'
  | 'progress'
  | 'active'
  | 'stalled'
  | 'drained'
  | 'ready'
  | 'paused'
  | 'resumed'
  | 'closing'
  | 'closed';

export class MemoryQueue extends CommonQueue {
  /** @internal */
  private readonly _queues: Record<string, MemoryQueueProcessor> = {};

  public get<Data = any, Response = any>(
    name: string
  ): MemoryQueueProcessor<Data, Response> {
    if (!this._queues[name]) {
      this._queues[name] = new MemoryQueueProcessor(name);
    }
    return this._queues[name];
  }

  public async close(name: string): Promise<boolean> {
    if (!this._queues[name]) {
      return false;
    }
    await this._queues[name].close();
    delete this._queues[name];
    return true;
  }

  public async closeAll(): Promise<void> {
    for (const queueName of Object.keys(this._queues)) {
      await this.close(queueName);
    }
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    try {
      const queue = new MemoryQueueProcessor('health-check');
      await queue.close();
      return { success: true };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }
}

class MemoryQueueProcessor<Data = any, Response = any> extends QueueProcessor<
  Data,
  Response,
  MemoryQueueJob<Data, Response>,
  MemoryJobOptions,
  MemoryWorker<Data, Response>,
  undefined
> {
  /** @internal */
  private readonly _jobs: Map<string, MemoryQueueJob<Data, Response>> =
    new Map();
  /** @internal */
  private readonly _workers: MemoryWorker<Data, Response>[] = [];
  /** @internal */
  private readonly _listeners: Record<
    string,
    { event: EventName; listener: QueueListener }
  > = {};
  /** @internal */
  private _processing = false;
  /** @internal */
  private _paused = false;
  /** @internal */
  private _closed = false;
  /** @internal */
  private _processingTimeout?: NodeJS.Timeout;

  constructor(public readonly name: string) {
    super();
    this.emitEvent('ready').catch((err) => {
      logger.error(`Memory queue processing error: ${err}`);
    });
  }

  public async sendJob(
    data: Data,
    name?: string,
    options: MemoryJobOptions = {}
  ): Promise<MemoryQueueJob<Data, Response>> {
    if (this._closed) {
      throw new Error(`Queue ${this.name} is closed`);
    }

    const jobId = uuid();
    const job: MemoryQueueJob<Data, Response> = {
      id: jobId,
      name: name ?? 'defaultJob',
      data,
      returnvalue: undefined as any,
      status: 'waiting',
      attempts: 0,
      maxAttempts: options.attempts ?? 3,
      createdAt: Date.now()
    };

    if (options.delay) {
      setTimeout(() => {
        this._jobs.set(jobId, job);
        this.processJobs();
      }, options.delay);
    } else {
      this._jobs.set(jobId, job);
      this.processJobs();
    }

    return job;
  }

  public async sendBulkJobs(
    jobs: Array<{
      data: Data;
      name?: string;
      options?: MemoryJobOptions;
    }>
  ): Promise<Array<MemoryQueueJob<Data, Response>>> {
    const createdJobs: MemoryQueueJob<Data, Response>[] = [];

    for (const jobSpec of jobs) {
      const job = await this.sendJob(
        jobSpec.data,
        jobSpec.name,
        jobSpec.options
      );
      createdJobs.push(job);
    }

    return createdJobs;
  }

  public addWorker(
    processor: (job: MemoryQueueJob<Data, Response>) => Promise<Response>,
    _options?: undefined
  ): MemoryWorker<Data, Response> {
    const worker: MemoryWorker<Data, Response> = {
      id: uuid(),
      processor,
      active: true
    };

    this._workers.push(worker);
    this.processJobs();

    return worker;
  }

  public async removeWorker(id: string): Promise<boolean> {
    const index = this._workers.findIndex((w) => w.id === id);
    if (index === -1) {
      return false;
    }

    this._workers[index].active = false;
    this._workers.splice(index, 1);
    return true;
  }

  public onCompleted(
    handler: (
      job: MemoryQueueJob<Data, Response>,
      result: Response,
      prev: string
    ) => QueueHandlerResponse
  ): string {
    return this.addListener('completed', handler);
  }

  public onFailed(
    handler: (
      job: MemoryQueueJob<Data, Response> | undefined,
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
      job: MemoryQueueJob<Data, Response>,
      progress: string | boolean | number | object
    ) => QueueHandlerResponse
  ): string {
    return this.addListener('progress', handler);
  }

  public onActive(
    handler: (
      job: MemoryQueueJob<Data, Response>,
      prev: string
    ) => QueueHandlerResponse
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
    this._closed = true;
    await this.emitEvent('closing', 'Queue is closing');

    if (this._processingTimeout) {
      clearTimeout(this._processingTimeout);
    }

    // Wait for active jobs to complete
    const activeJobs = Array.from(this._jobs.values()).filter(
      (job) => job.status === 'active'
    );

    if (activeJobs.length > 0) {
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          const stillActive = Array.from(this._jobs.values()).some(
            (job) => job.status === 'active'
          );
          if (!stillActive) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }

    await this.emitEvent('closed');
  }

  /** @internal */
  private addListener(event: EventName, listener: QueueListener): string {
    const listenerId = uuid();
    this._listeners[listenerId] = { event, listener };
    return listenerId;
  }

  /** @internal */
  private async emitEvent(event: EventName, ...args: any[]): Promise<void> {
    const handlerActions: Promise<void>[] = [];

    for (const value of Object.values(this._listeners)) {
      if (value.event !== event) {
        continue;
      }
      try {
        handlerActions.push(value.listener(...args) as Promise<void>);
      } catch (e) {
        logger.error(
          e,
          `Error occurred while handling event '${event}' for queue '${this.name}'`
        );
      }
    }

    await Promise.allSettled(handlerActions);
  }

  /** @internal */
  private processJobs(): void {
    if (this._processing || this._paused || this._closed) {
      return;
    }

    this._processing = true;

    this._processingTimeout = setTimeout(async () => {
      try {
        const waitingJobs = Array.from(this._jobs.values())
          .filter((job) => job.status === 'waiting')
          .sort((a, b) => a.createdAt - b.createdAt);

        const availableWorkers = this._workers.filter((w) => w.active);

        if (waitingJobs.length === 0 || availableWorkers.length === 0) {
          this._processing = false;

          if (waitingJobs.length === 0 && this._jobs.size > 0) {
            const hasActiveJobs = Array.from(this._jobs.values()).some(
              (job) => job.status === 'active'
            );
            if (!hasActiveJobs) {
              await this.emitEvent('drained');
            }
          }

          return;
        }

        // Process jobs with available workers
        const jobsToProcess = waitingJobs.slice(0, availableWorkers.length);

        for (let i = 0; i < jobsToProcess.length; i++) {
          const job = jobsToProcess[i];
          const worker = availableWorkers[i];

          await this.processJob(job, worker);
        }
      } finally {
        this._processing = false;
        // Continue processing if there are more jobs
        if (!this._paused && !this._closed) {
          this.processJobs();
        }
      }
    }, 0);
  }

  /** @internal */
  private async processJob(
    job: MemoryQueueJob<Data, Response>,
    worker: MemoryWorker<Data, Response>
  ): Promise<void> {
    job.status = 'active';
    job.processedAt = Date.now();
    job.attempts++;

    await this.emitEvent('active', job, job.status);

    try {
      const result = await worker.processor(job);

      job.returnvalue = result;
      job.status = 'completed';
      job.finishedAt = Date.now();

      await this.emitEvent('completed', job, result, 'active');

      // Clean up completed job after a short delay
      setTimeout(() => {
        this._jobs.delete(job.id!);
      }, 1000);
    } catch (error) {
      job.error = error as Error;

      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
        job.finishedAt = Date.now();

        await this.emitEvent('failed', job, error as Error, 'active');

        // Clean up failed job after a short delay
        setTimeout(() => {
          this._jobs.delete(job.id!);
        }, 1000);
      } else {
        // Retry the job
        job.status = 'waiting';
        await this.emitEvent('error', error as Error);
      }
    }
  }
}
