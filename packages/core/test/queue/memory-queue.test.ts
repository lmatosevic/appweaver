import { MemoryQueue } from '../../queue/memory-queue';

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
  throw new Error('Timed out waiting for the queue');
};

describe('memory-queue', () => {
  let queue: MemoryQueue;

  beforeEach(() => {
    queue = new MemoryQueue();
  });

  afterEach(async () => {
    await queue.closeAll();
  });

  describe('get', () => {
    test('creates a queue processor on first access', () => {
      const processor = queue.get('emails');

      expect(processor.name).toBe('emails');
    });

    test('returns the same processor for the same name', () => {
      expect(queue.get('emails')).toBe(queue.get('emails'));
    });

    test('creates separate processors for different names', () => {
      expect(queue.get('emails')).not.toBe(queue.get('reports'));
    });
  });

  describe('sendJob', () => {
    test('processes a job with the registered worker', async () => {
      const processor = queue.get('emails');
      const processed: any[] = [];
      processor.addWorker(async (job) => {
        processed.push(job.data);
        return 'sent';
      });

      const job = await processor.sendJob({ to: 'user@test.com' });

      expect(job.id).toBeDefined();
      expect(job.status).toBe('waiting');
      await waitFor(() => processed.length === 1);
      expect(processed[0]).toEqual({ to: 'user@test.com' });
    });

    test('uses the default job name', async () => {
      const processor = queue.get('emails');

      const job = await processor.sendJob({ to: 'user@test.com' });

      expect(job.name).toBe('defaultJob');
    });

    test('keeps a custom job name', async () => {
      const processor = queue.get('emails');

      const job = await processor.sendJob({}, 'welcomeEmail');

      expect(job.name).toBe('welcomeEmail');
    });

    test('completes the job with the worker result', async () => {
      const processor = queue.get('emails');
      const completed: any[] = [];
      processor.onCompleted((job, result) => {
        completed.push({ id: job.id, result });
      });
      processor.addWorker(async () => 'sent');

      const job = await processor.sendJob({ to: 'user@test.com' });

      await waitFor(() => completed.length === 1);
      expect(completed[0]).toEqual({ id: job.id, result: 'sent' });
    });

    test('emits the active event before processing', async () => {
      const processor = queue.get('emails');
      const active: string[] = [];
      processor.onActive((job) => {
        active.push(job.id!);
      });
      processor.addWorker(async () => 'ok');

      const job = await processor.sendJob({});

      await waitFor(() => active.length === 1);
      expect(active[0]).toBe(job.id);
    });

    test('processes the jobs that were queued before the worker', async () => {
      const processor = queue.get('emails');
      await processor.sendJob({ index: 1 });
      await processor.sendJob({ index: 2 });

      const processed: any[] = [];
      processor.addWorker(async (job) => {
        processed.push(job.data);
        return 'ok';
      });

      await waitFor(() => processed.length === 2);
      expect(processed).toEqual([{ index: 1 }, { index: 2 }]);
    });

    test('delays a job by the configured delay', async () => {
      const processor = queue.get('emails');
      const processed: any[] = [];
      processor.addWorker(async (job) => {
        processed.push(job.data);
        return 'ok';
      });

      await processor.sendJob({ delayed: true }, undefined, { delay: 50 });

      expect(processed).toHaveLength(0);
      await waitFor(() => processed.length === 1);
    });

    test('rejects new jobs once the queue is closed', async () => {
      const processor = queue.get('emails');
      await processor.close();

      await expect(processor.sendJob({})).rejects.toThrow(
        'Queue emails is closed'
      );
    });
  });

  describe('sendBulkJobs', () => {
    test('creates every job of the batch', async () => {
      const processor = queue.get('emails');
      const processed: any[] = [];
      processor.addWorker(async (job) => {
        processed.push(job.data);
        return 'ok';
      });

      const jobs = await processor.sendBulkJobs([
        { data: { index: 1 } },
        { data: { index: 2 }, name: 'second' }
      ]);

      expect(jobs).toHaveLength(2);
      expect(jobs[1].name).toBe('second');
      await waitFor(() => processed.length === 2);
    });
  });

  describe('retries', () => {
    test('retries a failing job until it succeeds', async () => {
      const processor = queue.get('emails');
      let attempts = 0;
      processor.addWorker(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('temporary failure');
        }
        return 'ok';
      });

      await processor.sendJob({}, undefined, { attempts: 3 });

      await waitFor(() => attempts >= 2);
      expect(attempts).toBe(2);
    });

    test('fails the job after the maximum number of attempts', async () => {
      const processor = queue.get('emails');
      const failed: Error[] = [];
      processor.onFailed((_job, error) => {
        failed.push(error);
      });
      processor.addWorker(async () => {
        throw new Error('permanent failure');
      });

      await processor.sendJob({}, undefined, { attempts: 2 });

      await waitFor(() => failed.length === 1);
      expect(failed[0].message).toBe('permanent failure');
    });

    test('emits an error event for a retried job', async () => {
      const processor = queue.get('emails');
      const errors: Error[] = [];
      processor.onError((error) => {
        errors.push(error);
      });
      processor.addWorker(async () => {
        throw new Error('temporary failure');
      });

      await processor.sendJob({}, undefined, { attempts: 2 });

      await waitFor(() => errors.length >= 1);
      expect(errors[0].message).toBe('temporary failure');
    });
  });

  describe('workers', () => {
    test('returns the created worker', () => {
      const processor = queue.get('emails');

      const worker = processor.addWorker(async () => 'ok');

      expect(worker.id).toBeDefined();
      expect(worker.active).toBe(true);
    });

    test('removes a worker by id', async () => {
      const processor = queue.get('emails');
      const worker = processor.addWorker(async () => 'ok');

      await expect(processor.removeWorker(worker.id)).resolves.toBe(true);
      expect(worker.active).toBe(false);
    });

    test('returns false when removing an unknown worker', async () => {
      const processor = queue.get('emails');

      await expect(processor.removeWorker('missing')).resolves.toBe(false);
    });

    test('keeps jobs waiting without an active worker', async () => {
      const processor = queue.get('emails');
      const worker = processor.addWorker(async () => 'ok');
      await processor.removeWorker(worker.id);

      const job = await processor.sendJob({});

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(job.status).toBe('waiting');
    });
  });

  describe('listeners', () => {
    test('removes a registered listener', async () => {
      const processor = queue.get('emails');
      const handler = jest.fn();
      const listenerId = processor.onCompleted(handler);

      expect(processor.removeListener(listenerId)).toBe(true);

      processor.addWorker(async () => 'ok');
      await processor.sendJob({});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler).not.toHaveBeenCalled();
    });

    test('returns false for an unknown listener id', () => {
      expect(queue.get('emails').removeListener('missing')).toBe(false);
    });

    test('emits the drained event once every job is processed', async () => {
      const processor = queue.get('emails');
      const drained = jest.fn();
      processor.onDrained(drained);
      processor.addWorker(async () => 'ok');

      await processor.sendJob({});

      await waitFor(() => drained.mock.calls.length > 0);
      expect(drained).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    test('closes a queue by name', async () => {
      queue.get('emails');

      await expect(queue.close('emails')).resolves.toBe(true);
      expect(queue.get('emails').name).toBe('emails');
    });

    test('returns false for an unknown queue', async () => {
      await expect(queue.close('missing')).resolves.toBe(false);
    });

    test('emits the closing and closed events', async () => {
      const processor = queue.get('emails');
      const closing = jest.fn();
      const closed = jest.fn();
      processor.onClosing(closing);
      processor.onClosed(closed);

      await processor.close();

      expect(closing).toHaveBeenCalledWith('Queue is closing');
      expect(closed).toHaveBeenCalled();
    });

    test('closes every queue', async () => {
      const emails = queue.get('emails');
      const reports = queue.get('reports');

      await queue.closeAll();

      await expect(emails.sendJob({})).rejects.toThrow();
      await expect(reports.sendJob({})).rejects.toThrow();
    });
  });

  describe('checkHealth', () => {
    test('reports a successful check', async () => {
      await expect(queue.checkHealth()).resolves.toEqual({ success: true });
    });
  });
});
