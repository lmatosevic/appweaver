import { Database, QueueJobSent } from '@appweaver/common';
import { define } from '@appweaver/core';
import {
  createDatabaseStub,
  DatabaseStub,
  resetContext
} from '@appweaver/testing';
import { DatabaseQueueHistory } from '../../queue/database-queue-history';

const UUID7 =
  /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

const sentJob = (overrides: Partial<QueueJobSent> = {}): QueueJobSent => ({
  queue: 'payments',
  jobId: 'job-1',
  name: 'charge',
  sentAt: new Date('2026-10-31T12:00:00Z'),
  driver: 'bullmq',
  data: { orderId: 'o-1' },
  metadata: { source: 'checkout' },
  options: { attempts: 3 },
  priority: 1,
  maxAttempts: 3,
  caller: {
    instance: 'api:1',
    userId: '7',
    authType: 'jwt',
    authSource: 'password',
    apiKeyId: undefined,
    parentId: 'parent-1',
    site: 'src/orders.ts:10:5'
  },
  ...overrides
});

describe('database-queue-history', () => {
  let db: DatabaseStub;
  let history: DatabaseQueueHistory;

  beforeEach(() => {
    resetContext();
    db = createDatabaseStub(['QueueJobRecord']);
    define(db.database, Database as any);
    history = new DatabaseQueueHistory();
  });

  afterAll(() => {
    resetContext();
  });

  describe('recordSent', () => {
    test('creates a pending record per job with its caller', async () => {
      const ids = await history.recordSent([
        sentJob(),
        sentJob({
          jobId: 'job-2',
          scheduledAt: new Date('2026-10-31T13:00:00Z')
        })
      ]);

      expect(ids).toHaveLength(2);
      expect(ids[0]).toMatch(UUID7);
      const { data } = db.lastQuery('createMany').args;
      expect(data.map((record: any) => record.id)).toEqual(ids);
      expect(data[0]).toMatchObject({
        queue: 'payments',
        jobId: 'job-1',
        name: 'charge',
        state: 'pending',
        driver: 'bullmq',
        data: { orderId: 'o-1' },
        metadata: { source: 'checkout' },
        maxAttempts: 3,
        priority: 1,
        enqueuedAt: new Date('2026-10-31T12:00:00Z'),
        enqueuedBy: 'api:1',
        userId: '7',
        authType: 'jwt',
        authSource: 'password',
        parentId: 'parent-1',
        callerSite: 'src/orders.ts:10:5'
      });
      expect(data[1].state).toBe('scheduled');
    });

    test('completes the record a worker created first for a sent job', async () => {
      db.setResult('QueueJobRecord', 'findFirst', { id: 'started-1' });

      const ids = await history.recordSent([sentJob()], { sent: true });

      expect(ids).toEqual(['started-1']);
      expect(db.lastQuery('findFirst').args.where).toEqual({
        queue: 'payments',
        jobId: 'job-1',
        enqueuedAt: null,
        createdAt: { gte: new Date('2026-10-31T11:59:55Z') }
      });
      const update = db.lastQuery('update').args;
      expect(update.where).toEqual({ id: 'started-1' });
      expect(update.data).toMatchObject({ userId: '7', enqueuedBy: 'api:1' });
      expect(update.data.state).toBeUndefined();
    });

    test('creates the record of a sent job no worker recorded', async () => {
      db.setResult('QueueJobRecord', 'findFirst', null);

      const ids = await history.recordSent([sentJob()], { sent: true });

      const { data } = db.lastQuery('create').args;
      expect(data).toMatchObject({ id: ids[0], state: 'pending' });
    });

    test('creates a scheduled record of a sent delayed job', async () => {
      db.setResult('QueueJobRecord', 'findFirst', null);

      await history.recordSent(
        [sentJob({ scheduledAt: new Date('2026-10-31T13:00:00Z') })],
        { sent: true }
      );

      expect(db.lastQuery('create').args.data.state).toBe('scheduled');
    });
  });

  describe('recordStarted', () => {
    const started = {
      queue: 'payments',
      jobId: 'job-1',
      name: 'charge',
      attempt: 2,
      startedAt: new Date('2026-10-31T12:00:01Z'),
      instance: 'worker:2',
      driver: 'bullmq',
      maxAttempts: 3,
      data: { orderId: 'o-1' }
    };

    test('updates the latest unfinished record of the job', async () => {
      db.setResult('QueueJobRecord', 'findFirst', { id: 'record-1' });

      await expect(history.recordStarted(started)).resolves.toBe('record-1');

      expect(db.lastQuery('findFirst').args).toMatchObject({
        where: {
          queue: 'payments',
          jobId: 'job-1',
          state: {
            in: ['pending', 'scheduled', 'running', 'retrying', 'stalled']
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      expect(db.lastQuery('update').args).toEqual({
        where: { id: 'record-1' },
        data: {
          state: 'running',
          attempt: 2,
          startedAt: started.startedAt,
          attemptedBy: 'worker:2',
          maxAttempts: 3
        }
      });
    });

    test('creates a record for a job sent without one', async () => {
      db.setResult('QueueJobRecord', 'findFirst', null);

      const id = await history.recordStarted({
        ...started,
        maxAttempts: undefined
      });

      expect(id).toMatch(UUID7);
      const { data } = db.lastQuery('create').args;
      expect(data).toMatchObject({
        id,
        queue: 'payments',
        jobId: 'job-1',
        name: 'charge',
        state: 'running',
        data: { orderId: 'o-1' }
      });
      expect(data).not.toHaveProperty('maxAttempts');
    });
  });

  describe('recordFinished', () => {
    const finishedAt = new Date('2026-10-31T12:00:02Z');

    test('records a completed job with its result', async () => {
      await history.recordFinished('record-1', {
        state: 'completed',
        attempt: 1,
        finishedAt,
        durationMs: 12,
        result: { charged: true }
      });

      expect(db.lastQuery('update').args).toEqual({
        where: { id: 'record-1' },
        data: {
          state: 'completed',
          attempt: 1,
          durationMs: 12,
          finishedAt,
          result: { charged: true }
        }
      });
    });

    test('appends the error of a retried attempt, leaving it unfinished', async () => {
      db.setResult('QueueJobRecord', 'findUnique', {
        errors: [{ attempt: 1, at: 'a', message: 'first' }]
      });
      const error = { attempt: 2, at: 'b', message: 'second' };

      await history.recordFinished('record-1', {
        state: 'retrying',
        attempt: 2,
        finishedAt,
        durationMs: 3,
        error
      });

      const { data } = db.lastQuery('update').args;
      expect(data).toEqual({
        state: 'retrying',
        attempt: 2,
        durationMs: 3,
        errors: [{ attempt: 1, at: 'a', message: 'first' }, error],
        lastError: 'second'
      });
    });

    test('starts the errors of a record without any', async () => {
      db.setResult('QueueJobRecord', 'findUnique', null);
      const error = { attempt: 1, at: 'a', message: 'broken' };

      await history.recordFinished('record-1', {
        state: 'failed',
        attempt: 1,
        finishedAt,
        durationMs: 3,
        error
      });

      const { data } = db.lastQuery('update').args;
      expect(data.errors).toEqual([error]);
      expect(data.finishedAt).toBe(finishedAt);
    });
  });

  describe('recordStalled', () => {
    test('marks the running record of the job as stalled', async () => {
      db.setResult('QueueJobRecord', 'findFirst', { id: 'record-1' });

      await history.recordStalled('payments', 'job-1');

      expect(db.lastQuery('findFirst').args.where).toEqual({
        queue: 'payments',
        jobId: 'job-1',
        state: 'running'
      });
      expect(db.lastQuery('update').args).toEqual({
        where: { id: 'record-1' },
        data: { state: 'stalled' }
      });
    });

    test('ignores a job without a running record', async () => {
      db.setResult('QueueJobRecord', 'findFirst', null);

      await history.recordStalled('payments', 'job-1');

      expect(db.queries.map((query) => query.method)).toEqual(['findFirst']);
    });
  });

  describe('prune', () => {
    test('deletes the finished records before a date', async () => {
      db.setResult('QueueJobRecord', 'deleteMany', { count: 5 });
      const before = new Date('2026-10-01T00:00:00Z');

      await expect(history.prune(before)).resolves.toBe(5);

      expect(db.lastQuery('deleteMany').args).toEqual({
        where: {
          state: { in: ['completed', 'failed'] },
          finishedAt: { lt: before }
        }
      });
    });
  });
});
