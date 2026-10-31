import {
  AuthType,
  configOverrides,
  createLogger,
  Queue,
  QueueHistory,
  QueueJobFinished,
  QueueJobSent,
  QueueJobStarted
} from '@appweaver/common';
import { define } from '../../../context/dependency-injection';
import { runAs } from '../../../context/auth-context';
import {
  currentTransaction,
  runInTransaction,
  settleTransaction,
  TransactionContext
} from '../../../context/transaction-scope';
import withQueueHistory, {
  QueueHistoryRecorder
} from '../../../queue/history/history-queue';
import { MemoryQueue } from '../../../queue/memory-queue';
import { resetContext } from '../../fixtures/context-fixture';

const logger = createLogger('queue');

/** Waits until the condition holds or the timeout elapses. */
const waitFor = async (
  condition: () => boolean,
  timeout: number = 2000
): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for the history');
};

/** Records the calls of the queue history in memory, in the order they were made. */
class FakeHistory extends QueueHistory {
  public readonly calls: string[] = [];
  public readonly sent: { jobs: QueueJobSent[]; sent?: boolean }[] = [];
  public readonly started: QueueJobStarted[] = [];
  public readonly finished: { id: string; outcome: QueueJobFinished }[] = [];
  public readonly stalled: string[] = [];
  public inTransaction = false;
  private _ids = 0;

  public async recordSent(
    jobs: QueueJobSent[],
    options: { sent?: boolean } = {}
  ): Promise<string[]> {
    this.inTransaction ||= currentTransaction() !== undefined;
    this.calls.push('sent');
    this.sent.push({ jobs, sent: options.sent });
    return jobs.map(() => `record-${++this._ids}`);
  }

  public async recordStarted(job: QueueJobStarted): Promise<string> {
    this.inTransaction ||= currentTransaction() !== undefined;
    this.calls.push('started');
    this.started.push(job);
    return `record-${++this._ids}`;
  }

  public async recordFinished(
    id: string,
    outcome: QueueJobFinished
  ): Promise<void> {
    this.calls.push(outcome.state);
    this.finished.push({ id, outcome });
  }

  public async recordStalled(queue: string, jobId: string): Promise<void> {
    this.stalled.push(`${queue}/${jobId}`);
  }

  public async prune(): Promise<number> {
    return 0;
  }
}

describe('history-queue', () => {
  let history: FakeHistory;
  let inner: MemoryQueue;
  let queue: Queue;

  beforeEach(() => {
    resetContext();
    history = new FakeHistory();
    define(history, QueueHistory);
    inner = new MemoryQueue();
    queue = withQueueHistory(inner);
  });

  afterEach(async () => {
    await inner.closeAll();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
    jest.restoreAllMocks();
  });

  afterAll(() => {
    resetContext();
  });

  describe('withQueueHistory', () => {
    test('keeps the driver and its other members', async () => {
      expect(queue).toBeInstanceOf(MemoryQueue);
      expect(queue.constructor).toBe(MemoryQueue);
      await expect(queue.checkHealth()).resolves.toEqual({ success: true });

      queue.get('jobs');
      await expect(queue.close('jobs')).resolves.toBe(true);
    });

    test('returns the same processor of a queue', () => {
      expect(queue.get('jobs')).toBe(queue.get('jobs'));
      expect(queue.get('jobs')).not.toBe(inner.get('jobs'));
    });

    test('leaves the excluded queues unrecorded', () => {
      configOverrides.QUEUE_HISTORY_EXCLUDE_QUEUES = ['email'];

      expect(queue.get('email')).toBe(inner.get('email'));
      expect(queue.get('jobs')).not.toBe(inner.get('jobs'));
    });

    test('records only the listed queues', () => {
      configOverrides.QUEUE_HISTORY_QUEUES = ['payments'];

      expect(queue.get('jobs')).toBe(inner.get('jobs'));
      expect(queue.get('payments')).not.toBe(inner.get('payments'));
    });
  });

  describe('sendJob', () => {
    test('records the job before sending it with a generated job id', async () => {
      const processor = queue.get<{ id: number }>('jobs');
      const send = jest.spyOn(inner.get('jobs'), 'sendJob');
      send.mockImplementation(async (data, name, options) => {
        expect(history.sent).toHaveLength(1);
        return {
          id: options?.jobId,
          name: name!,
          data,
          returnvalue: undefined
        } as any;
      });

      const job = await processor.sendJob({ id: 1 }, 'charge', {
        delay: 1000,
        priority: 2,
        attempts: 5,
        metadata: { orderId: 'o-1' },
        providerOptions: { lifo: true }
      });

      const [record] = history.sent[0].jobs;
      expect(job.id).toMatch(/^[\da-f-]{36}$/);
      expect(record).toMatchObject({
        queue: 'jobs',
        jobId: job.id,
        name: 'charge',
        data: { id: 1 },
        metadata: { orderId: 'o-1' },
        options: { delay: 1000, priority: 2, attempts: 5 },
        priority: 2,
        maxAttempts: 5,
        driver: undefined,
        caller: { instance: expect.stringMatching(/:\d+$/) }
      });
      expect(record.scheduledAt!.getTime()).toBe(
        record.sentAt.getTime() + 1000
      );
      expect(history.sent[0].sent).toBeUndefined();
      expect(send.mock.calls[0][2]).toEqual({
        delay: 1000,
        priority: 2,
        attempts: 5,
        providerOptions: { lifo: true },
        jobId: job.id
      });
    });

    test('keeps a given job id and the default name', async () => {
      const job = await queue.get('jobs').sendJob({}, undefined, {
        jobId: 'custom-1'
      });

      expect(job.id).toBe('custom-1');
      expect(history.sent[0].jobs[0]).toMatchObject({
        jobId: 'custom-1',
        name: 'defaultJob',
        maxAttempts: 3,
        options: undefined,
        scheduledAt: undefined
      });
    });

    test('records the user sending the job', async () => {
      await runAs(
        { id: 7, roles: [] } as any,
        () => queue.get('jobs').sendJob({}),
        { authType: AuthType.ApiKey, apiKey: { id: 3 } }
      );

      expect(history.sent[0].jobs[0].caller).toMatchObject({
        userId: '7',
        authType: 'apiKey',
        apiKeyId: '3'
      });
    });

    test('records the code sending the job with the caller site', async () => {
      configOverrides.QUEUE_HISTORY_RECORD_CALLER_SITE = true;

      await queue.get('jobs').sendJob({});

      expect(history.sent[0].jobs[0].caller.site).toMatch(
        /history-queue\.test\.ts:\d+:\d+$/
      );
    });

    test('leaves the payload out without storeData', async () => {
      configOverrides.QUEUE_HISTORY_STORE_DATA = false;

      await queue.get('jobs').sendJob({ secret: 'x' });

      expect(history.sent[0].jobs[0].data).toBeUndefined();
    });

    test('stores a too large payload as its size', async () => {
      configOverrides.QUEUE_HISTORY_MAX_PAYLOAD_BYTES = 10;

      await queue.get('jobs').sendJob({ text: 'a long payload' });

      expect(history.sent[0].jobs[0].data).toEqual({
        truncated: true,
        bytes: 25
      });
    });

    test('marks a payload that is not serializable', async () => {
      const data: Record<string, unknown> = {};
      data.self = data;

      await queue.get('jobs').sendJob(data);

      expect(history.sent[0].jobs[0].data).toEqual({ unserializable: true });
    });

    test('records a job the queue refuses as failed', async () => {
      jest
        .spyOn(inner.get('jobs'), 'sendJob')
        .mockRejectedValue(new Error('Redis is down'));

      await expect(queue.get('jobs').sendJob({})).rejects.toThrow(
        'Redis is down'
      );

      await waitFor(() => history.finished.length === 1);
      expect(history.finished[0]).toMatchObject({
        id: 'record-1',
        outcome: {
          state: 'failed',
          attempt: 0,
          error: { attempt: 0, message: 'Redis is down', name: 'Error' }
        }
      });
    });

    test('sends the job when the history fails to record it', async () => {
      jest
        .spyOn(history, 'recordSent')
        .mockRejectedValue(new Error('database down'));
      const warn = jest
        .spyOn(logger, 'warn')
        .mockImplementation(() => undefined);

      const job = await queue.get('jobs').sendJob({ id: 1 });

      expect(job.id).toBeDefined();
      expect(warn).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Queue history write failed'
      );
    });

    test('records the job of a transaction once it settles, outside of it', async () => {
      const transaction: TransactionContext = {
        tx: {},
        commitCallbacks: new Map(),
        rollbackCallbacks: []
      };

      await runInTransaction(transaction, () =>
        queue.get('jobs').sendJob({ id: 1 })
      );
      expect(history.sent).toHaveLength(0);

      await runInTransaction(transaction, () =>
        settleTransaction(transaction, true)
      );

      expect(history.sent).toHaveLength(1);
      expect(history.sent[0].sent).toBe(true);
      expect(history.inTransaction).toBe(false);
    });

    test('records the job of a rolled back transaction too', async () => {
      const transaction: TransactionContext = {
        tx: {},
        commitCallbacks: new Map(),
        rollbackCallbacks: []
      };

      await runInTransaction(transaction, () =>
        queue.get('jobs').sendJob({ id: 1 })
      );
      await settleTransaction(transaction, false);

      expect(history.sent).toHaveLength(1);
    });
  });

  describe('sendBulkJobs', () => {
    test('records every job, then sends them', async () => {
      const jobs = await queue.get('jobs').sendBulkJobs([
        { data: { id: 1 }, name: 'a' },
        { data: { id: 2 }, name: 'b', options: { jobId: 'b-1' } }
      ]);

      expect(jobs.map((job) => job.id)).toEqual([
        expect.stringMatching(/^[\da-f-]{36}$/),
        'b-1'
      ]);
      expect(history.sent[0].jobs.map((job) => job.jobId)).toEqual(
        jobs.map((job) => job.id)
      );
    });
  });

  describe('addWorker', () => {
    test('records the attempt and the result of a job, in order', async () => {
      const processor = queue.get<{ value: number }, number>('jobs');
      processor.addWorker(async (job) => job.data.value * 2);

      const job = await processor.sendJob({ value: 21 }, 'double');

      await waitFor(() => history.finished.length === 1);
      expect(history.calls).toEqual(['sent', 'started', 'completed']);
      expect(history.started[0]).toMatchObject({
        queue: 'jobs',
        jobId: job.id,
        name: 'double',
        attempt: 1,
        maxAttempts: 3,
        data: { value: 21 }
      });
      expect(history.finished[0]).toMatchObject({
        id: 'record-2',
        outcome: { state: 'completed', attempt: 1, result: 42 }
      });
    });

    test('leaves the result out without storeResult', async () => {
      configOverrides.QUEUE_HISTORY_STORE_RESULT = false;
      const processor = queue.get('jobs');
      processor.addWorker(async () => 'secret');

      await processor.sendJob({});

      await waitFor(() => history.finished.length === 1);
      expect(history.finished[0].outcome.result).toBeUndefined();
    });

    test('records a retried attempt, then the final failure', async () => {
      jest
        .spyOn(createLogger('queue'), 'warn')
        .mockImplementation(() => undefined);
      jest
        .spyOn(createLogger('queue'), 'error')
        .mockImplementation(() => undefined);
      const processor = queue.get('jobs');
      processor.addWorker(async () => {
        throw Object.assign(new Error('broken'), { code: 'E_BROKEN' });
      });

      await processor.sendJob({}, 'fail', { attempts: 2 });

      await waitFor(() => history.finished.length === 2);
      expect(history.finished.map(({ outcome }) => outcome.state)).toEqual([
        'retrying',
        'failed'
      ]);
      expect(history.finished[1].outcome.error).toMatchObject({
        attempt: 2,
        message: 'broken',
        code: 'E_BROKEN',
        stack: expect.stringContaining('broken')
      });
    });

    test('records a failure as final for a driver without attempts', async () => {
      jest
        .spyOn(createLogger('queue'), 'warn')
        .mockImplementation(() => undefined);
      const memory = inner.get('jobs');
      jest.spyOn(memory, 'jobInfo').mockReturnValue({});
      const processor = queue.get('jobs');
      processor.addWorker(async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'plain';
      });

      await processor.sendJob({}, 'fail', { attempts: 3 });

      await waitFor(() => history.finished.length >= 1);
      expect(history.finished[0].outcome).toMatchObject({
        state: 'failed',
        attempt: 1,
        error: { message: 'plain' }
      });
    });

    test('records an unrecoverable error as final', async () => {
      jest
        .spyOn(createLogger('queue'), 'warn')
        .mockImplementation(() => undefined);
      const processor = queue.get('jobs');
      processor.addWorker(async () => {
        throw Object.assign(new Error('fatal'), {
          name: 'UnrecoverableError'
        });
      });

      await processor.sendJob({}, 'fail', { attempts: 3 });

      await waitFor(() => history.finished.length >= 1);
      expect(history.finished[0].outcome.state).toBe('failed');
    });

    test('names the record of the job sending another one as its parent', async () => {
      const parent = queue.get('parents');
      const child = queue.get('children');
      parent.addWorker(async () => {
        await child.sendJob({}, 'child');
      });

      await parent.sendJob({}, 'parent');

      await waitFor(() => history.sent.length === 2);
      expect(history.sent[1].jobs[0]).toMatchObject({
        queue: 'children',
        caller: { parentId: 'record-2' }
      });
    });

    test('records a stalled job', async () => {
      const memory = inner.get('jobs');
      let stalled: ((jobId: string, prev: string) => unknown) | undefined;
      jest.spyOn(memory, 'onStalled').mockImplementation((handler) => {
        stalled = handler;
        return 'listener';
      });
      const processor = queue.get('jobs');
      processor.addWorker(async () => undefined);
      processor.addWorker(async () => undefined);

      stalled!('job-1', 'active');

      await waitFor(() => history.stalled.length === 1);
      expect(history.stalled).toEqual(['jobs/job-1']);
      expect(memory.onStalled).toHaveBeenCalledTimes(1);
    });
  });

  describe('QueueHistoryRecorder', () => {
    test('records the jobs of the driver it names', async () => {
      const recorder = new QueueHistoryRecorder('bullmq');
      const processor = recorder.wrap(inner.get('jobs'), 'jobs');

      await processor.sendJob({});

      expect(history.sent[0].jobs[0].driver).toBe('bullmq');
    });
  });
});
