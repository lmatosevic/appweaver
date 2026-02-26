import type {
  JobsOptions,
  QueueOptions,
  WorkerOptions,
  Processor
} from 'bullmq';

export interface FakeJob<T = any> {
  id: string;
  name: string;
  data: T;
  opts?: JobsOptions;
  waitUntilFinished: (client?: unknown) => Promise<unknown>;
}

export class Queue<T = any> {
  public name: string;
  public opts?: QueueOptions;
  public jobs: FakeJob<T>[] = [];

  constructor(name: string, opts?: QueueOptions) {
    this.name = name;
    this.opts = opts;
  }

  async add(name: string, data: T, opts?: JobsOptions): Promise<FakeJob<T>> {
    const job: FakeJob<T> = {
      id: String(this.jobs.length + 1),
      name,
      data,
      opts,
      waitUntilFinished: async () => ({
        mocked: true,
        data
      })
    };

    this.jobs.push(job);
    return job;
  }

  async close(): Promise<void> {
    // no-op
  }
}

export class Worker<T = any, R = any> {
  public name: string;
  public processor: Processor<T, R>;
  public opts?: WorkerOptions;

  constructor(name: string, processor: Processor<T, R>, opts?: WorkerOptions) {
    this.name = name;
    this.processor = processor;
    this.opts = opts;
  }

  async on(): Promise<void> {
    // no-op
  }

  async close(): Promise<void> {
    // no-op
  }
}
