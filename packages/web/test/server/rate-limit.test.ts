import * as common from '@appweaver/common';
import { ErrorCode, Memory, MemoryError } from '@appweaver/common';
import { define } from '@appweaver/core';
import { resetContext } from '@appweaver/testing';
import { registerRateLimit } from '../../server/rate-limit';
import { Server } from '../../types/server';
import { createTestServer } from '../fixtures/server-fixture';

// A Redis client running the rate limit script on counters in a map, or
// failing it the way the guarded client of a Redis that is down does
class FakeRedis {
  down = false;
  counters = new Map<string, number>();
  disconnect = jest.fn();

  defineCommand(name: string) {
    (this as any)[name] = (key: string, window: number, ...args: any[]) => {
      const callback = args[args.length - 1];
      if (this.down) {
        callback(
          new MemoryError(
            ErrorCode.MemoryUnavailable,
            'Redis is unavailable: Redis circuit breaker is open',
            { retryAfter: 10 }
          )
        );
        return;
      }
      const current = (this.counters.get(key) ?? 0) + 1;
      this.counters.set(key, current);
      callback(null, [current, window]);
    };
  }
}

const overrides = (common as any).configOverrides;

describe('rate-limit', () => {
  let redis: FakeRedis;
  let createClient: jest.Mock;
  let server: Server;

  const start = async () => {
    server = createTestServer();
    registerRateLimit(server);
    server.after(() => {
      server.get(
        '/open',
        { config: { rateLimit: { max: 1 } } },
        async () => 'ok'
      );
      server.get(
        '/secure',
        { config: { rateLimit: { max: 1, secure: true } } },
        async () => 'ok'
      );
      server.get(
        '/strict',
        { config: { rateLimit: { max: 1, skipOnError: false } } },
        async () => 'ok'
      );
      server.get(
        '/lenient',
        { config: { rateLimit: { max: 1, secure: true, skipOnError: true } } },
        async () => 'ok'
      );
    });
    await server.ready();
  };

  const get = (url: string) => server.inject({ method: 'GET', url });

  beforeEach(() => {
    resetContext();
    redis = new FakeRedis();
    createClient = jest.fn(() => redis);
    define({ createClient }, Memory);
  });

  afterEach(async () => {
    await server?.close();
    delete overrides.RATE_LIMIT_SECURE_SKIP_ON_ERROR;
    delete overrides.RATE_LIMIT_SKIP_ON_ERROR;
    delete overrides.RATE_LIMIT_STORE;
  });

  afterAll(() => {
    resetContext();
  });

  describe('registerRateLimit', () => {
    test('counts in a client of the memory, closed with the server', async () => {
      await start();

      expect((await get('/secure')).statusCode).toBe(200);
      const limited = await get('/secure');

      expect(limited.statusCode).toBe(429);
      expect(limited.json().code).toBe(ErrorCode.RateLimited);
      expect(createClient).toHaveBeenCalledWith(
        expect.objectContaining({ connectionName: 'rate-limit' })
      );

      await server.close();
      expect(redis.disconnect).toHaveBeenCalled();
    });

    test('counts in the process with the local store', async () => {
      overrides.RATE_LIMIT_STORE = 'local';
      await start();

      expect((await get('/open')).statusCode).toBe(200);
      expect((await get('/open')).statusCode).toBe(429);
      expect(createClient).not.toHaveBeenCalled();
    });

    test('skips the limit of a route while Redis is down', async () => {
      redis.down = true;
      await start();

      expect((await get('/open')).statusCode).toBe(200);
      expect((await get('/open')).statusCode).toBe(200);
    });

    test('fails a secure route while Redis is down', async () => {
      redis.down = true;
      await start();

      const response = await get('/secure');

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        code: ErrorCode.MemoryUnavailable,
        details: { retryAfter: 10 }
      });
    });

    test('skips the limit of a secure route with RATE_LIMIT_SECURE_SKIP_ON_ERROR', async () => {
      overrides.RATE_LIMIT_SECURE_SKIP_ON_ERROR = true;
      redis.down = true;
      await start();

      expect((await get('/secure')).statusCode).toBe(200);
    });

    test('fails every route without RATE_LIMIT_SKIP_ON_ERROR', async () => {
      overrides.RATE_LIMIT_SKIP_ON_ERROR = false;
      redis.down = true;
      await start();

      expect((await get('/open')).statusCode).toBe(503);
    });

    test('lets the route skipOnError override both keys', async () => {
      redis.down = true;
      await start();

      expect((await get('/strict')).statusCode).toBe(503);
      expect((await get('/lenient')).statusCode).toBe(200);
    });
  });
});
