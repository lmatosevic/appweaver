import type {
  BulkJobOptions,
  JobsOptions,
  Processor,
  QueueOptions,
  WorkerOptions
} from 'bullmq';

export interface FakeJob<T = any> {
  id: string;
  name: string;
  data: T;
  opts?: JobsOptions;
  waitUntilFinished: (client?: unknown) => Promise<unknown>;
  resultPromise?: Promise<unknown>;
  resolveResult?: (value: unknown) => void;
  rejectResult?: (reason?: any) => void;
}

// Global registry to track queues and their workers
const queueWorkers = new Map<string, Worker<any, any>[]>();

export class Queue<T = any> {
  public name: string;
  public opts?: QueueOptions;
  public jobs: FakeJob<T>[] = [];

  constructor(name: string, opts?: QueueOptions) {
    this.name = name;
    this.opts = opts;
  }

  async add(name: string, data: T, opts?: JobsOptions): Promise<FakeJob<T>> {
    let resolveResult: (value: unknown) => void;
    let rejectResult: (reason?: any) => void;

    const resultPromise = new Promise((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const job: FakeJob<T> = {
      id: String(this.jobs.length + 1),
      name,
      data,
      opts,
      waitUntilFinished: async () => resultPromise,
      resultPromise,
      resolveResult: resolveResult!,
      rejectResult: rejectResult!
    };

    this.jobs.push(job);

    // Execute the job with registered workers
    setImmediate(() => this.processJob(job));

    return job;
  }

  private async processJob(job: FakeJob<T>): Promise<void> {
    const workers = queueWorkers.get(this.name) || [];

    for (const worker of workers) {
      try {
        // Execute the processor
        if (worker.processor) {
          const result = await worker.processor(job as any);

          // Notify completed event handlers
          const completedHandlers = worker.eventHandlers.get('completed') || [];
          for (const handler of completedHandlers) {
            await handler(job, result);
          }

          // Resolve the job's result promise
          job.resolveResult?.(result);
        }
      } catch (error) {
        // Notify failed event handlers
        const failedHandlers = worker.eventHandlers.get('failed') || [];
        for (const handler of failedHandlers) {
          await handler(job, error);
        }

        // Reject the job's result promise
        job.rejectResult?.(error);
      }
    }
  }

  async addBulk(
    jobs: { name: string; data: any; opts?: BulkJobOptions }[]
  ): Promise<FakeJob<T>[]> {
    const addedJobs: FakeJob<T>[] = [];

    for (const job of jobs) {
      const addedJob = await this.add(job.name, job.data, job.opts);
      addedJobs.push(addedJob);
    }

    return addedJobs;
  }

  async close(): Promise<void> {
    // no-op
  }
}

export class Worker<T = any, R = any> {
  public name: string;
  public opts?: WorkerOptions;
  public processor: Processor<T, R>;
  public eventHandlers: Map<string, ((...args: any[]) => Promise<void>)[]> =
    new Map();

  constructor(name: string, processor: Processor<T, R>, opts?: WorkerOptions) {
    this.name = name;
    this.processor = processor;
    this.opts = opts;

    // Register this worker for the queue
    if (!queueWorkers.has(name)) {
      queueWorkers.set(name, []);
    }
    queueWorkers.get(name)!.push(this);
  }

  async on(
    event: string,
    handler: (...args: any[]) => Promise<void>
  ): Promise<void> {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  async close(): Promise<void> {
    // Remove this worker from the registry
    const workers = queueWorkers.get(this.name);
    if (workers) {
      const index = workers.indexOf(this);
      if (index > -1) {
        workers.splice(index, 1);
      }
    }
  }
}
