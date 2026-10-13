jest.mock('bullmq', () => {
  const { EventEmitter } = jest.requireActual('node:events');

  class Queue extends EventEmitter {
    static instances: Queue[] = [];
    add = jest.fn(async (name: string, data: any, opts: any) => ({
      id: '1',
      name,
      data,
      opts
    }));
    addBulk = jest.fn(async (jobs: any[]) => jobs);
    close = jest.fn(async () => {});

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

  return { Queue, Worker };
});

import { EventEmitter } from 'node:events';
import { Queue, Worker } from 'bullmq';
import { ErrorCode, Redis } from '@appweaver/common';
import { define } from '../../context';
import { BullQueue } from '../../queue/bull-queue';
import { resetContext } from '../fixtures/context-fixture';

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
  let queue: BullQueue;

  beforeEach(() => {
    resetContext();
    queues().length = 0;
    workers().length = 0;
    connection = new FakeConnection();
    define({ createClient: () => connection }, Redis);
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
        { data: 1, name: 'defaultJob' },
        { data: 2, name: 'urgent', priority: 1 }
      ]);
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
