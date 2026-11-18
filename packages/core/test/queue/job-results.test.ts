import { createLogger, ErrorCode, PubSub, SmsError } from '@appweaver/common';
import { define } from '../../context/dependency-injection';
import { MemoryPubSub } from '../../pubsub/memory-pubsub';
import { MemoryQueue } from '../../queue/memory-queue';
import { JobResults, toJobErrorData } from '../../queue/job-results';
import { resetContext } from '../fixtures/context-fixture';

const logger = createLogger('queue');

describe('job-results', () => {
  let queue: MemoryQueue;

  beforeEach(() => {
    resetContext();
    queue = new MemoryQueue();
    jest.spyOn(logger, 'error').mockImplementation();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await queue.closeAll();
  });

  afterAll(() => {
    resetContext();
  });

  describe('JobResults', () => {
    test('resolves with the result of the waited job without a pub/sub', async () => {
      const processor = queue.get<number, number>('double');
      processor.addWorker(async (job) => job.data * 2);
      const results = new JobResults(processor, 'double');

      await expect(
        results.wait((jobId) => processor.sendJob(21, undefined, { jobId }))
      ).resolves.toBe(42);
    });

    test('rejects with the error of the job, created by the option', async () => {
      const processor = queue.get('fail');
      processor.addWorker(async () => {
        throw new Error('Broken');
      });
      const results = new JobResults(processor, 'fail', {
        toError: (error) => new Error(`Wrapped: ${error.message}`)
      });

      await expect(
        results.wait((jobId) =>
          processor.sendJob({}, undefined, { jobId, attempts: 1 })
        )
      ).rejects.toThrow('Wrapped: Broken');
    });

    test('rejects with a plain error by default, named as the original', async () => {
      const processor = queue.get('fail');
      processor.addWorker(async () => {
        throw new TypeError('Wrong');
      });
      const results = new JobResults(processor, 'fail');

      await expect(
        results.wait((jobId) =>
          processor.sendJob({}, undefined, { jobId, attempts: 1 })
        )
      ).rejects.toMatchObject({ name: 'TypeError', message: 'Wrong' });
    });

    test('delivers the result through the pub/sub to the waiting instance', async () => {
      const pubsub = new MemoryPubSub();
      define(pubsub, PubSub);
      const processor = queue.get<string, string>('echo');
      const waiting = new JobResults(processor, 'echo');
      // The instance running the worker publishes the result
      const other = new MemoryQueue().get<string, string>('echo');
      new JobResults(other, 'echo');
      other.addWorker(async (job) => job.data.toUpperCase());

      await expect(
        waiting.wait((jobId) => other.sendJob('hi', undefined, { jobId }))
      ).resolves.toBe('HI');
      await other.close();
      await waiting.close();
      await waiting.close();
    });

    test('rejects when the job cannot be sent', async () => {
      const processor = queue.get('closed');
      const results = new JobResults(processor, 'closed');

      await expect(
        results.wait(async () => {
          throw new Error('Closed');
        })
      ).rejects.toThrow('Closed');
    });

    test('logs a result that cannot be published', async () => {
      const pubsub = new MemoryPubSub();
      jest.spyOn(pubsub, 'publish').mockRejectedValue(new Error('Down'));
      define(pubsub, PubSub);
      const processor = queue.get('lost');
      const results = new JobResults(processor, 'lost');
      processor.addWorker(async () => true);

      void results.wait((jobId) => processor.sendJob({}, undefined, { jobId }));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(Error),
        expect.stringContaining('not published')
      );
      await results.close();
    });

    test('publishes nothing for the jobs nobody waits for', async () => {
      const pubsub = new MemoryPubSub();
      const publish = jest.spyOn(pubsub, 'publish');
      define(pubsub, PubSub);
      const processor = queue.get('fire');
      new JobResults(processor, 'fire');
      processor.addWorker(async () => true);

      await processor.sendJob({});
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(publish).not.toHaveBeenCalled();
    });
  });

  describe('toJobErrorData', () => {
    test('keeps the code and the details of an Appweaver error', () => {
      const error = new SmsError(ErrorCode.SmsSendFailed, 'Failed', {
        provider: 'twilio'
      });

      expect(toJobErrorData(error)).toEqual({
        name: 'SmsError',
        message: 'Failed',
        code: ErrorCode.SmsSendFailed,
        details: { provider: 'twilio' }
      });
    });

    test('keeps the name and the message of an error', () => {
      expect(toJobErrorData(new RangeError('Out'))).toEqual({
        name: 'RangeError',
        message: 'Out'
      });
    });

    test('converts any other value to a message', () => {
      expect(toJobErrorData('failed')).toEqual({ message: 'failed' });
    });
  });
});
