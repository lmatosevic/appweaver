import { Command, ReplyError } from 'ioredis';
import { ErrorCode, MemoryError } from '@appweaver/common';
import { CircuitBreaker } from '../circuit-breaker';
import { guardClient } from '../client-guard';

// A client settling every command it sends with the next outcome
class FakeClient {
  status = 'ready';
  outcome: { result?: any; error?: Error } = { result: 'OK' };
  sendCommand = jest.fn((command: Command) => {
    if (this.outcome.error) {
      command.reject(this.outcome.error);
    } else {
      command.resolve(this.outcome.result);
    }
    return command.promise;
  });
}

describe('client-guard', () => {
  let fake: FakeClient;
  let send: jest.Mock;
  let breaker: CircuitBreaker;
  let client: any;

  beforeEach(() => {
    fake = new FakeClient();
    send = fake.sendCommand;
    breaker = new CircuitBreaker(2, 5000);
    client = guardClient(fake as any, breaker);
  });

  const run = (name = 'get') =>
    client.sendCommand(new Command(name, ['key'])) as Promise<any>;

  describe('guardClient', () => {
    test('resolves the reply and records a success', async () => {
      breaker.failure();
      const success = jest.spyOn(breaker, 'success');

      expect(await run()).toBe('OK');
      expect(success).toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
    });

    test('keeps an error reply, which counts as an answer', async () => {
      fake.outcome = { error: new ReplyError('NOSCRIPT No matching script') };

      await expect(run()).rejects.toBeInstanceOf(ReplyError);
      await expect(run()).rejects.toBeInstanceOf(ReplyError);
      expect(breaker.isOpen()).toBe(false);
    });

    test('fails an unanswered command with MEMORY_UNAVAILABLE', async () => {
      const timeout = new Error('Command timed out');
      fake.outcome = { error: timeout };

      const error = await run().catch((e) => e);

      expect(error).toBeInstanceOf(MemoryError);
      expect(error).toMatchObject({
        code: ErrorCode.MemoryUnavailable,
        message: 'Redis is unavailable: Command timed out',
        details: {},
        cause: timeout
      });
    });

    test('rejects the commands without sending them once the breaker opens', async () => {
      fake.outcome = { error: new Error('Command timed out') };
      await run().catch(() => undefined);

      const opening = await run().catch((e) => e);
      expect(opening.details.retryAfter).toBe(5);

      const error = await run().catch((e) => e);

      expect(send).toHaveBeenCalledTimes(2);
      expect(error).toMatchObject({
        code: ErrorCode.MemoryUnavailable,
        message: 'Redis is unavailable: Redis circuit breaker is open',
        details: { retryAfter: 5 }
      });
    });

    test('sends the commands of a client that is not ready past the breaker', async () => {
      breaker.failure();
      breaker.failure();
      fake.status = 'connect';
      fake.outcome = {
        error: new Error(
          "Stream isn't writeable and enableOfflineQueue options is false"
        )
      };
      const failure = jest.spyOn(breaker, 'failure');

      await expect(run('info')).rejects.toMatchObject({
        code: ErrorCode.MemoryUnavailable
      });
      expect(send).toHaveBeenCalledTimes(1);
      expect(failure).not.toHaveBeenCalled();

      fake.outcome = { result: 'OK' };
      expect(await run('info')).toBe('OK');
      expect(breaker.isOpen()).toBe(true);
    });
  });
});
