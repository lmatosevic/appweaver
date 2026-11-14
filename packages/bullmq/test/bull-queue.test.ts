jest.mock('bullmq', () => {
  const { EventEmitter } = jest.requireActual('node:events');

  class Queue extends EventEmitter {
    static instances: Queue[] = [];
    // The timestamps of the jobs stored in Redis, by job key
    stored = new Map<string, string>();
    add = jest.fn(async (name: string, data: any, opts: any) => ({
      id: opts.jobId ?? '1',
      name,
      data,
      opts,
      timestamp: 2000
    }));
    addBulk = jest.fn(async (jobs: any[]) =>
      jobs.map((job) => ({ ...job, id: job.opts.jobId, timestamp: 2000 }))
    );
    close = jest.fn(async () => {});
    client = Promise.resolve({
      hget: jest.fn(async (key: string) => this.stored.get(key) ?? null)
    });
    toKey = (id: string) => `bull:${this.name}:${id}`;

    constructor(
      public name: string,
      public opts: any
    ) {
      super();
      Queue.instances.push(this);
    }
  }

  class Worker extends EventEmitter {
    static instances: Worker[] = [];
    id: string;
    close = jest.fn(async () => {});

    constructor(
      public name: string,
      public processor: any,
      public opts: any
    ) {
      super();
      this.id = opts.name;
      Worker.instances.push(this);
    }
  }

  const Job = {
    fromId: jest.fn(async (queue: any, id: string) => ({
      id,
      name: 'existing',
      data: { existing: true },
      timestamp: Number(queue.stored.get(queue.toKey(id)))
    }))
  };

  return { Job, Queue, Worker };
});

import { EventEmitter } from 'node:events';
import { Queue, Worker } from 'bullmq';
import { currentTraceId, ErrorCode, Memory, withSpan } from '@appweaver/common';
import { define } from '@appweaver/core';
import {
  recordTelemetry,
  resetContext,
  TelemetryRecorder
} from '@appweaver/testing';
import { BullQueue } from '../bull-queue';

/** A stub of the ioredis connection a queue processor is given. */
class FakeConnection extends EventEmitter {
  status = 'ready';
  quit = jest.fn(async () => 'OK');
  disconnect = jest.fn();
}

const queues = () => (Queue as any).instances as any[];
const workers = () => (Worker as any).instances as any[];

describe('bull-queue', () => {
  let connection: FakeConnection;
  let createClient: jest.Mock;
  let queue: BullQueue;

  beforeEach(() => {
    resetContext();
    queues().length = 0;
    workers().length = 0;
    connection = new FakeConnection();
    createClient = jest.fn(() => connection);
    define({ createClient }, Memory);
    queue = new BullQueue();
  });

  afterAll(() => {
    resetContext();
  });

  describe('get', () => {
    test('creates a processor once per queue name', () => {
      const processor = queue.get('emails');

      expect(processor.name).toBe('emails');
      expect(queue.get('emails')).toBe(processor);
      expect(queue.get('reports')).not.toBe(processor);
      expect(queues()).toHaveLength(2);
    });

    test('connects without the command timeout of a guarded client', () => {
      queue.get('emails');

      expect(createClient).toHaveBeenCalledWith(
        { connectionName: 'queue:emails', maxRetriesPerRequest: null },
        false
      );
    });
  });

  describe('close', () => {
    test('closes a known queue and quits its connection', async () => {
      queue.get('emails');

      expect(await queue.close('emails')).toBe(true);
      expect(queues()[0].close).toHaveBeenCalled();
      expect(connection.quit).toHaveBeenCalled();
      expect(await queue.close('emails')).toBe(false);
    });

    test('drops the connection that is down, forcing the workers to close', async () => {
      const processor = queue.get('emails');
      processor.addWorker(async () => true);
      connection.status = 'reconnecting';

      await queue.closeAll();

      expect(workers()[0].close).toHaveBeenCalledWith(true);
      expect(connection.disconnect).toHaveBeenCalled();
      expect(connection.quit).not.toHaveBeenCalled();
    });
  });

  describe('sendJob', () => {
    test('adds a job under the default name', async () => {
      const job = await queue.get('emails').sendJob({ to: 'a@test.com' });

      expect(job.name).toBe('defaultJob');
      expect(queues()[0].add).toHaveBeenCalledWith(
        'defaultJob',
        { to: 'a@test.com' },
        {}
      );
    });

    test('adds the bulk jobs with their names and options', async () => {
      await queue
        .get('emails')
        .sendBulkJobs([
          { data: 1 },
          { data: 2, name: 'urgent', options: { priority: 1 } }
        ]);

      expect(queues()[0].addBulk).toHaveBeenCalledWith([
        { data: 1, name: 'defaultJob', opts: {} },
        { data: 2, name: 'urgent', opts: { priority: 1 } }
      ]);
    });

    test('passes the driver options with the job options', async () => {
      await queue.get('emails').sendJob({}, 'report', {
        delay: 1000,
        providerOptions: { lifo: true }
      });

      expect(queues()[0].add).toHaveBeenCalledWith(
        'report',
        {},
        { lifo: true, delay: 1000 }
      );
    });

    test('returns the added job of a new job id', async () => {
      const processor = queue.get('emails');
      queues()[0].stored.set('bull:emails:r-1', '2000');

      const job = await processor.sendJob({ to: 'a' }, 'report', {
        jobId: 'r-1'
      });

      expect(job).toMatchObject({ id: 'r-1', data: { to: 'a' } });
    });

    test('returns the job already in the queue under a given job id', async () => {
      const processor = queue.get('emails');
      queues()[0].stored.set('bull:emails:r-1', '1000');

      const job = await processor.sendJob({ to: 'a' }, 'report', {
        jobId: 'r-1'
      });

      expect(job).toMatchObject({
        id: 'r-1',
        data: { existing: true },
        timestamp: 1000
      });
    });

    test('returns the added job when the queue lost the existing one', async () => {
      const processor = queue.get('emails');
      queues()[0].stored.set('bull:emails:r-1', '1000');
      const { Job } = jest.requireMock('bullmq');
      Job.fromId.mockResolvedValueOnce(undefined);

      const job = await processor.sendJob({ to: 'a' }, 'report', {
        jobId: 'r-1'
      });

      expect(job).toMatchObject({ data: { to: 'a' }, timestamp: 2000 });
    });

    test('returns the added job when the queue has no job of its id', async () => {
      const job = await queue
        .get('emails')
        .sendJob({ to: 'a' }, 'report', { jobId: 'r-1' });

      expect(job).toMatchObject({ data: { to: 'a' } });
    });

    test('returns the jobs already in the queue among the bulk jobs', async () => {
      const processor = queue.get('emails');
      queues()[0].stored.set('bull:emails:b', '1000');

      const jobs = await processor.sendBulkJobs([
        { data: 1, options: { jobId: 'a' } },
        { data: 2, options: { jobId: 'b' } },
        { data: 3 }
      ]);

      expect(jobs.map((job: any) => job.timestamp)).toEqual([2000, 1000, 2000]);
    });

    test('waits for a connection being established', async () => {
      connection.status = 'connecting';
      const sent = queue.get('emails').sendJob({});

      connection.status = 'ready';
      connection.emit('ready');

      await expect(sent).resolves.toBeDefined();
    });

    test('fails fast while Redis is down', async () => {
      connection.status = 'reconnecting';

      await expect(queue.get('emails').sendJob({})).rejects.toMatchObject({
        code: ErrorCode.QueueUnavailable,
        details: { queue: 'emails' }
      });
      expect(queues()[0].add).not.toHaveBeenCalled();
    });
  });

  describe('workers and listeners', () => {
    test('notifies only the listeners of the emitted event', async () => {
      const processor = queue.get('emails');
      const completed = jest.fn();
      const failed = jest.fn();
      processor.onCompleted(completed);
      processor.onFailed(failed);
      processor.addWorker(async () => true);

      workers()[0].emit('completed', { id: '1' }, true);
      await new Promise(setImmediate);

      expect(completed).toHaveBeenCalledWith({ id: '1' }, true);
      expect(failed).not.toHaveBeenCalled();
    });

    test('stops notifying a removed listener', async () => {
      const processor = queue.get('emails');
      const drained = jest.fn();
      const id = processor.onDrained(drained);
      processor.addWorker(async () => true);

      expect(processor.removeListener(id)).toBe(true);
      expect(processor.removeListener(id)).toBe(false);
      workers()[0].emit('drained');
      await new Promise(setImmediate);

      expect(drained).not.toHaveBeenCalled();
    });

    test('removes a worker by its id', async () => {
      const processor = queue.get('emails');
      const worker = processor.addWorker(async () => true);

      expect(await processor.removeWorker('unknown')).toBe(false);
      expect(await processor.removeWorker(worker.id)).toBe(true);
      expect(workers()[0].close).toHaveBeenCalled();
    });
  });

  describe('checkHealth', () => {
    test('reports the state of the Redis connection', async () => {
      expect(await queue.checkHealth()).toEqual({ success: true });

      connection.status = 'end';
      const result = await queue.checkHealth();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Redis connection is not ready');
      await queue.onDestroy();
    });
  });
});

describe('bull-queue telemetry', () => {
  let telemetry: TelemetryRecorder;
  let queue: BullQueue;

  beforeEach(() => {
    resetContext();
    queues().length = 0;
    workers().length = 0;
    define({ createClient: () => new FakeConnection() }, Memory);
    telemetry = recordTelemetry();
    queue = new BullQueue();
  });

  afterEach(async () => {
    await telemetry.stop();
    resetContext();
  });

  test('stores the trace context of the sender with the job, continued by the worker', async () => {
    const orders = queue.get('orders');
    orders.addWorker(async () => currentTraceId());

    const job = await withSpan('checkout', {}, () =>
      orders.sendJob({ id: 1 }, 'charge', { delay: 5 })
    );

    const send = telemetry.span('send orders');
    // The field BullMQ keeps the propagation metadata of a job in
    expect((job.opts as any).delay).toBe(5);
    expect(JSON.parse((job.opts as any).telemetry.metadata)).toEqual({
      traceparent: `00-${send.spanContext().traceId}-${send.spanContext().spanId}-01`
    });

    const traceId = await workers()[0].processor({ ...job, attemptsMade: 1 });

    const process = telemetry.span('process orders');
    expect(traceId).toBe(send.spanContext().traceId);
    expect(process.parentSpanContext?.spanId).toBe(send.spanContext().spanId);
    expect(process.attributes).toMatchObject({
      'messaging.system': 'bullmq',
      'messaging.message.id': job.id,
      'appweaver.queue.job.name': 'charge',
      'appweaver.queue.job.attempt': 2
    });
  });

  test('sends a bulk of jobs in one span, each carrying its context', async () => {
    const orders = queue.get('orders');

    const jobs = await orders.sendBulkJobs([{ data: 1 }, { data: 2 }]);

    const send = telemetry.span('send orders');
    expect(send.attributes['messaging.batch.message_count']).toBe(2);
    for (const job of jobs) {
      expect((job.opts as any).telemetry.metadata).toContain(
        send.spanContext().traceId
      );
    }
  });

  test('processes a job without a readable trace context in a new trace', async () => {
    const orders = queue.get('orders');
    orders.addWorker(async () => true);

    for (const opts of [undefined, {}, { telemetry: { metadata: '{bad' } }]) {
      await workers()[0].processor({
        id: '9',
        name: 'x',
        attemptsMade: 0,
        opts
      });
    }
    await workers()[0].processor({
      id: '9',
      name: 'x',
      attemptsMade: 0,
      opts: { telemetry: { metadata: '"text"' } }
    });

    const spans = telemetry.spans();
    expect(spans).toHaveLength(4);
    expect(spans.every((span) => !span.parentSpanContext)).toBe(true);
  });
});
